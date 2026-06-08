from django.urls import path
from .views import (
    LoginView,
    PositionsView,
    CandidatesByPositionView,
    VoteView,
    ResultsView,
    AdminCandidateView,
    AdminCandidateDetailView,
    AdminPositionView,
    AdminUserView,
    WinnersView,
    ResetElectionView,
    AdminUploadImageView,
    MeView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='api-login'),
    path('me/', MeView.as_view(), name='api-me'),
    path('positions/', PositionsView.as_view(), name='positions'),
    path('positions/<int:position_id>/candidates/', CandidatesByPositionView.as_view(), name='candidates-by-position'),
    path('vote/', VoteView.as_view(), name='vote'),
    path('results/', ResultsView.as_view(), name='results'),
    path('admin/candidates/', AdminCandidateView.as_view(), name='admin-candidates'),
    path('admin/candidates/<int:candidate_id>/', AdminCandidateDetailView.as_view(), name='admin-candidate-detail'),
    path('admin/positions/', AdminPositionView.as_view(), name='admin-positions'),
    path('admin/users/', AdminUserView.as_view(), name='admin-users'),
    path('admin/winners/', WinnersView.as_view(), name='admin-winners'),
    path('admin/upload-image/', AdminUploadImageView.as_view(), name='admin-upload-image'),
    path('admin/reset/', ResetElectionView.as_view(), name='admin-reset'),
]
