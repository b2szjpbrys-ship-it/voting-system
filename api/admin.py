from django.contrib import admin, messages
from django.db.models import Count
from django.utils.html import format_html
from .models import Voter, Position, Candidate, Vote

admin.site.site_header = 'Voting Admin'
admin.site.site_title = 'Voting Admin'
admin.site.index_title = 'Voting Admin'
admin.site.site_url = None


@admin.register(Voter)
class VoterAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'phone', 'has_voted', 'created_at')
    search_fields = ('name', 'phone')


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'candidate_count')
    search_fields = ('name',)
    actions = ('show_winners',)
    exclude = ('description',)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(candidate_count=Count('candidates'))

    def candidate_count(self, obj):
        return getattr(obj, 'candidate_count', 0)
    candidate_count.short_description = 'Candidates'

    @admin.action(description='Show winners for selected positions')
    def show_winners(self, request, queryset):
        messages_list = []
        for pos in queryset:
            winner = pos.candidates.annotate(votes_count=Count('votes')).order_by('-votes_count').first()
            if winner:
                messages_list.append(f"{pos.name}: {winner.name} ({winner.votes_count} votes)")
            else:
                messages_list.append(f"{pos.name}: no candidates")
        self.message_user(request, '\n'.join(messages_list), messages.INFO)


@admin.register(Candidate)
class CandidateAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'position', 'vote_count', 'position_total_votes', 'vote_percentage', 'image_preview')
    list_filter = ('position',)
    readonly_fields = ('image_preview',)
    fields = ('name', 'position', 'description', 'image', 'image_url', 'image_preview')
    search_fields = ('name',)

    def get_queryset(self, request):
        queryset = super().get_queryset(request).annotate(vote_count=Count('votes'))
        self.position_vote_totals = dict(
            Vote.objects.values('position').annotate(total_votes=Count('id')).values_list('position', 'total_votes')
        )
        return queryset

    def vote_count(self, obj):
        return getattr(obj, 'vote_count', 0)
    vote_count.short_description = 'Votes'

    def position_total_votes(self, obj):
        return getattr(self, 'position_vote_totals', {}).get(obj.position_id, 0)
    position_total_votes.short_description = 'Position total votes'

    def vote_percentage(self, obj):
        total_votes = getattr(self, 'position_vote_totals', {}).get(obj.position_id, 0)
        if total_votes == 0:
            return '0%'
        percentage = (getattr(obj, 'vote_count', 0) / total_votes) * 100
        return f'{percentage:.1f}%'
    vote_percentage.short_description = 'Percentage'

    def image_preview(self, obj):
        if obj.image and hasattr(obj.image, 'url'):
            return format_html('<img src="{}" style="max-height:100px; max-width:160px; object-fit:cover;" />', obj.image.url)
        return ''
    image_preview.short_description = 'Image Preview'


@admin.register(Vote)
class VoteAdmin(admin.ModelAdmin):
    list_display = ('id', 'voter', 'candidate', 'position', 'created_at')
    actions = ('reset_election',)

    @admin.action(description='Reset election (remove all votes and clear voter voting status)')
    def reset_election(self, request, queryset):
        Vote.objects.all().delete()
        Voter.objects.update(has_voted=False)
        self.message_user(request, 'Election reset: all votes removed and voter voting status cleared.', messages.SUCCESS)
