from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.db import connection
from .models import Candidate, Position


def reset_autoincrement(table_name):
    vendor = connection.vendor
    with connection.cursor() as cursor:
        if vendor == 'mysql':
            cursor.execute(f"ALTER TABLE {table_name} AUTO_INCREMENT = 1")
        elif vendor == 'sqlite':
            cursor.execute("DELETE FROM sqlite_sequence WHERE name = %s", [table_name])


@receiver(post_delete, sender=Candidate)
def reset_candidate_autoincrement(sender, instance, **kwargs):
    if Candidate.objects.count() == 0:
        reset_autoincrement('candidates')


@receiver(post_delete, sender=Position)
def reset_position_autoincrement(sender, instance, **kwargs):
    if Position.objects.count() == 0:
        reset_autoincrement('positions')
