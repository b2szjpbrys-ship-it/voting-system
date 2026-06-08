from datetime import timedelta
import re

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
import os
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Voter, Position, Candidate, Vote
from .serializers import (
    VoterSerializer,
    PositionSerializer,
    CandidateSerializer,
)

PHONE_REGEX = re.compile(r'^\+255[6-9]\d{8}$')


class LoginView(APIView):
    def post(self, request):
        name = request.data.get('name')
        phone = request.data.get('phone')
        if not name or not phone:
            return Response({'detail': 'name and phone required'}, status=status.HTTP_400_BAD_REQUEST)

        phone = re.sub(r'[\s-]+', '', phone)
        if not PHONE_REGEX.match(phone):
            return Response({
                'detail': 'phone must be a valid Tanzania number starting with +255 and 9 digits'
            }, status=status.HTTP_400_BAD_REQUEST)

        voter = Voter.objects.filter(phone=phone).first()
        if voter:
            voter.name = name
            voter.generate_token()
            voter.save(update_fields=['name', 'token'])
        else:
            voter = Voter.objects.create(
                name=name,
                phone=phone,
                password='',
            )
            voter.generate_token()

        serializer = VoterSerializer(voter)
        return Response(serializer.data)


class PositionsView(APIView):
    def get(self, request):
        qs = Position.objects.all()
        serializer = PositionSerializer(qs, many=True)
        return Response(serializer.data)


class CandidatesByPositionView(APIView):
    def get(self, request, position_id):
        qs = Candidate.objects.filter(position_id=position_id).annotate(votes_count=Count('votes'))
        serializer = CandidateSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)


class VoteView(APIView):
    def post(self, request):
        token = request.data.get('token')
        candidate_id = request.data.get('candidate_id')
        if not token or not candidate_id:
            return Response({'detail': 'token and candidate_id required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            voter = Voter.objects.get(token=token)
        except Voter.DoesNotExist:
            return Response({'detail': 'invalid token'}, status=status.HTTP_403_FORBIDDEN)
        try:
            candidate = Candidate.objects.select_related('position').get(pk=candidate_id)
        except Candidate.DoesNotExist:
            return Response({'detail': 'candidate not found'}, status=status.HTTP_404_NOT_FOUND)

        existing_vote = Vote.objects.filter(voter=voter, position=candidate.position).first()
        if existing_vote:
            elapsed = timezone.now() - existing_vote.created_at
            if elapsed > timedelta(minutes=30):
                return Response({'detail': 'vote lock time expired; vote cannot be changed'}, status=status.HTTP_403_FORBIDDEN)
            if existing_vote.candidate_id == candidate.id:
                return Response({'detail': 'vote already recorded for this candidate'}, status=status.HTTP_200_OK)
            with transaction.atomic():
                existing_vote.candidate = candidate
                existing_vote.created_at = timezone.now()
                existing_vote.save(update_fields=['candidate', 'created_at'])
            return Response({'detail': 'vote updated'}, status=status.HTTP_200_OK)

        # Create a fresh vote for this position and allow editing for 30 minutes
        with transaction.atomic():
            Vote.objects.create(voter=voter, candidate=candidate, position=candidate.position)
            if not voter.has_voted:
                voter.has_voted = True
                voter.save(update_fields=['has_voted'])

        return Response({'detail': 'vote recorded'}, status=status.HTTP_201_CREATED)


class ResultsView(APIView):
    def get(self, request):
        total_voters = Voter.objects.count()
        total_votes = Vote.objects.count()
        positions = Position.objects.all().prefetch_related('candidates')
        data = []
        for pos in positions:
            candidates = Candidate.objects.filter(position=pos).annotate(vote_count=Count('votes')).order_by('-vote_count')
            position_total_votes = sum(c.vote_count for c in candidates)
            data.append({
                'position_id': pos.id,
                'position': pos.name,
                'position_total_votes': position_total_votes,
                'candidates': [
                    {
                        'id': c.id,
                        'name': c.name,
                        'description': c.description or '',
                        'image_url': c.image.url if getattr(c, 'image', None) else (c.image_url or ''),
                        'votes': c.vote_count,
                        'percent': round((c.vote_count / position_total_votes * 100) if position_total_votes else 0, 1),
                    }
                    for c in candidates
                ],
            })
        return Response({
            'total_voters': total_voters,
            'total_votes': total_votes,
            'positions': data,
        })


class AdminBaseView(APIView):
    def _is_admin(self, request):
        key = request.headers.get('X-Admin-Key') or request.query_params.get('admin_key')
        return key == getattr(settings, 'ADMIN_API_KEY', 'adminsecret')

    def dispatch(self, request, *args, **kwargs):
        if not self._is_admin(request):
            return Response({'detail': 'forbidden'}, status=status.HTTP_403_FORBIDDEN)
        return super().dispatch(request, *args, **kwargs)


class AdminCandidateView(AdminBaseView):
    def get(self, request):
        qs = Candidate.objects.select_related('position').annotate(vote_count=Count('votes'))
        serializer = CandidateSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        name = request.data.get('name')
        position_id = request.data.get('position_id')
        image_url = request.data.get('image_url')
        if not name or not position_id:
            return Response({'detail': 'name and position_id required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            pos = Position.objects.get(pk=position_id)
        except Position.DoesNotExist:
            return Response({'detail': 'position not found'}, status=status.HTTP_404_NOT_FOUND)
        cand = Candidate.objects.create(name=name, position=pos, image_url=image_url)
        return Response({'id': cand.id, 'name': cand.name}, status=status.HTTP_201_CREATED)


class MeView(APIView):
    def get(self, request):
        auth = request.headers.get('Authorization', '')
        token = auth.replace('Token ', '') if auth.startswith('Token ') else None
        if not token:
            return Response({'detail': 'authorization missing'}, status=status.HTTP_403_FORBIDDEN)
        try:
            voter = Voter.objects.get(token=token)
        except Voter.DoesNotExist:
            return Response({'detail': 'invalid token'}, status=status.HTTP_403_FORBIDDEN)
        serializer = VoterSerializer(voter)
        return Response(serializer.data)


class AdminPositionView(AdminBaseView):
    def get(self, request):
        qs = Position.objects.all()
        serializer = PositionSerializer(qs, many=True)
        return Response(serializer.data)

    def post(self, request):
        name = request.data.get('name')
        description = request.data.get('description', '')
        if not name:
            return Response({'detail': 'name required'}, status=status.HTTP_400_BAD_REQUEST)
        position = Position.objects.create(name=name, description=description)
        return Response({'id': position.id, 'name': position.name}, status=status.HTTP_201_CREATED)


class AdminCandidateDetailView(AdminBaseView):
    def patch(self, request, candidate_id):
        try:
            candidate = Candidate.objects.get(pk=candidate_id)
        except Candidate.DoesNotExist:
            return Response({'detail': 'candidate not found'}, status=status.HTTP_404_NOT_FOUND)
        name = request.data.get('name')
        position_id = request.data.get('position_id')
        image_url = request.data.get('image_url')
        if name:
            candidate.name = name
        if position_id:
            try:
                candidate.position = Position.objects.get(pk=position_id)
            except Position.DoesNotExist:
                return Response({'detail': 'position not found'}, status=status.HTTP_404_NOT_FOUND)
        if image_url is not None:
            candidate.image_url = image_url
        candidate.save()
        return Response({'id': candidate.id, 'name': candidate.name})

    def delete(self, request, candidate_id):
        try:
            candidate = Candidate.objects.get(pk=candidate_id)
        except Candidate.DoesNotExist:
            return Response({'detail': 'candidate not found'}, status=status.HTTP_404_NOT_FOUND)
        candidate.delete()
        return Response({'detail': 'candidate deleted'})


class AdminUserView(AdminBaseView):
    def get(self, request):
        qs = Voter.objects.all().order_by('-created_at')
        serializer = VoterSerializer(qs, many=True)
        return Response(serializer.data)


class ResetElectionView(AdminBaseView):
    def post(self, request):
        # Delete all votes and reset voters' has_voted flag
        votes_deleted, _ = Vote.objects.all().delete()
        Voter.objects.update(has_voted=False)
        return Response({'detail': 'election reset', 'votes_deleted': votes_deleted})


class WinnersView(AdminBaseView):
    def get(self, request):
        positions = Position.objects.all()
        winners = []
        for pos in positions:
            top = Candidate.objects.filter(position=pos).annotate(votes_count=Count('votes')).order_by('-votes_count').first()
            if top:
                winners.append({
                    'position_id': pos.id,
                    'position': pos.name,
                    'candidate_id': top.id,
                    'candidate': top.name,
                    'image_url': top.image_url or '',
                    'votes': getattr(top, 'votes_count', 0),
                })
        return Response(winners)


class AdminUploadImageView(AdminBaseView):
    def post(self, request):
        candidate_id = request.data.get('candidate_id') or request.POST.get('candidate_id')
        file = request.FILES.get('image')
        if not candidate_id or not file:
            return Response({'detail': 'candidate_id and image file required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            candidate = Candidate.objects.get(pk=candidate_id)
        except Candidate.DoesNotExist:
            return Response({'detail': 'candidate not found'}, status=status.HTTP_404_NOT_FOUND)

        # Save file to media/candidates/<id>/
        filename = file.name
        rel_dir = os.path.join('candidates', str(candidate_id))
        rel_path = os.path.join(rel_dir, filename)
        saved_path = default_storage.save(rel_path, ContentFile(file.read()))
        media_url = getattr(settings, 'MEDIA_URL', '/media/')
        candidate.image_url = os.path.join(media_url, saved_path).replace('\\', '/')
        candidate.save(update_fields=['image_url'])
        return Response({'detail': 'image uploaded', 'image_url': candidate.image_url})


class AdminVoteView(AdminBaseView):
    def get(self, request):
        qs = Vote.objects.select_related('voter', 'candidate', 'position').all()
        data = [
            {
                'id': vote.id,
                'voter': vote.voter.name,
                'phone': vote.voter.phone,
                'candidate': vote.candidate.name,
                'position': vote.position.name,
                'created_at': vote.created_at,
            }
            for vote in qs
        ]
        return Response(data)


class ResetElectionView(AdminBaseView):
    def post(self, request):
        Vote.objects.all().delete()
        Voter.objects.update(has_voted=False)
        return Response({'detail': 'election reset completed'})
