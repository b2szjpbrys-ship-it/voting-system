from rest_framework import serializers
from .models import Voter, Position, Candidate


class VoterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Voter
        fields = [
            "id",
            "name",
            "phone",
            "has_voted",
            "is_admin",
            "token",
            "login_locked_until",
            "created_at",
            "updated_at",
        ]


class PositionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Position
        fields = [
            "id",
            "name",
            "description",
            "created_at",
            "updated_at",
        ]


class CandidateSerializer(serializers.ModelSerializer):
    position_name = serializers.CharField(source="position.name", read_only=True)
    votes_count = serializers.IntegerField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Candidate
        fields = [
            "id",
            "name",
            "description",
            "image_url",
            "position",
            "position_name",
            "votes_count",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        request = self.context.get("request")
        url = ""

        if getattr(obj, "image", None):
            try:
                url = obj.image.url
            except Exception:
                url = ""

        if not url and getattr(obj, "image_url", None):
            url = obj.image_url or ""

        if url and request and url.startswith("/"):
            return request.build_absolute_uri(url)

        return url
