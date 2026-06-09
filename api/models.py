from django.db import models
from django.utils import timezone
from datetime import timedelta
import secrets
import random


class Voter(models.Model):
    id = models.AutoField(primary_key=True)

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=32, unique=True)

    password = models.CharField(max_length=128, blank=True)

    has_voted = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)

    token = models.CharField(max_length=64, blank=True, null=True, unique=True)

    # Lock user after completing voting
    login_locked_until = models.DateTimeField(blank=True, null=True)

    # OTP fields for phone verification
    otp_code = models.CharField(max_length=6, blank=True, null=True)
    otp_expires_at = models.DateTimeField(blank=True, null=True)
    phone_verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'

    def generate_token(self):
        self.token = secrets.token_urlsafe(32)
        self.save(update_fields=['token'])
        return self.token

    def lock_login_for_5_minutes(self):
        self.login_locked_until = timezone.now() + timedelta(minutes=5)
        self.save(update_fields=['login_locked_until'])

    def is_login_locked(self):
        if self.login_locked_until and self.login_locked_until > timezone.now():
            return True
        return False

    def generate_otp(self):
        self.otp_code = str(random.randint(100000, 999999))
        self.otp_expires_at = timezone.now() + timedelta(minutes=5)
        self.save(update_fields=['otp_code', 'otp_expires_at'])
        return self.otp_code

    def verify_otp(self, code):
        if not self.otp_code or not self.otp_expires_at:
            return False

        if self.otp_expires_at < timezone.now():
            return False

        if str(code) != str(self.otp_code):
            return False

        self.phone_verified = True
        self.otp_code = None
        self.otp_expires_at = None
        self.save(update_fields=['phone_verified', 'otp_code', 'otp_expires_at'])
        return True

    def clear_otp(self):
        self.otp_code = None
        self.otp_expires_at = None
        self.save(update_fields=['otp_code', 'otp_expires_at'])

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
    position = models.ForeignKey(
        Position,
        related_name='candidates',
        on_delete=models.CASCADE
    )

    description = models.TextField(blank=True, null=True)

    image = models.ImageField(
        upload_to='candidates/',
        blank=True,
        null=True
    )

    image_url = models.CharField(
        max_length=1024,
        blank=True,
        null=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'candidates'
        unique_together = ('name', 'position')

    def __str__(self):
        return f"{self.name} - {self.position.name}"


class Vote(models.Model):
    id = models.BigAutoField(primary_key=True)

    voter = models.ForeignKey(
        Voter,
        db_column='user_id',
        related_name='votes',
        on_delete=models.CASCADE
    )

    candidate = models.ForeignKey(
        Candidate,
        related_name='votes',
        on_delete=models.CASCADE
    )

    position = models.ForeignKey(
        Position,
        related_name='votes',
        on_delete=models.CASCADE
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'votes'
        unique_together = ('voter', 'position')

    def __str__(self):
        return f"Vote: {self.voter} -> {self.candidate}"