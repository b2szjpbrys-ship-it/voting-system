from django.db import models
import secrets


class Voter(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, unique=True)
    password = models.CharField(max_length=128, blank=True)
    has_voted = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)
    token = models.CharField(max_length=64, blank=True, null=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'

    def generate_token(self):
        self.token = secrets.token_urlsafe(32)
        self.save(update_fields=['token'])
        return self.token

    def __str__(self):
        return f"{self.name} ({self.phone})"


class Position(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'positions'

    def __str__(self):
        return self.name


class Candidate(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    position = models.ForeignKey(Position, related_name='candidates', on_delete=models.CASCADE)
    description = models.TextField(blank=True, null=True)
    image = models.ImageField(upload_to='candidates/', blank=True, null=True)
    image_url = models.CharField(max_length=1024, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'candidates'
        unique_together = ('name', 'position')

    def __str__(self):
        return f"{self.name} - {self.position.name}"


class Vote(models.Model):
    id = models.BigAutoField(primary_key=True)
    voter = models.ForeignKey(Voter, db_column='user_id', related_name='votes', on_delete=models.CASCADE)
    candidate = models.ForeignKey(Candidate, related_name='votes', on_delete=models.CASCADE)
    position = models.ForeignKey(Position, related_name='votes', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'votes'
        unique_together = ('voter', 'position')

    def __str__(self):
        return f"Vote: {self.voter} -> {self.candidate}"
