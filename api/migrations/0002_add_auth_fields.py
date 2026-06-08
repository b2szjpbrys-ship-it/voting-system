from django.db import migrations


def add_auth_fields(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SHOW COLUMNS FROM users LIKE 'password'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE users ADD COLUMN password VARCHAR(128) NULL")

        cursor.execute("SHOW COLUMNS FROM users LIKE 'token'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE users ADD COLUMN token VARCHAR(64) NULL")

        cursor.execute("SHOW INDEX FROM users WHERE Key_name = 'ux_users_token'")
        if cursor.fetchone() is None:
            cursor.execute("CREATE UNIQUE INDEX ux_users_token ON users(token)")


def remove_auth_fields(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SHOW INDEX FROM users WHERE Key_name = 'ux_users_token'")
        if cursor.fetchone() is not None:
            cursor.execute("DROP INDEX ux_users_token ON users")

        cursor.execute("SHOW COLUMNS FROM users LIKE 'token'")
        if cursor.fetchone() is not None:
            cursor.execute("ALTER TABLE users DROP COLUMN token")

        cursor.execute("SHOW COLUMNS FROM users LIKE 'password'")
        if cursor.fetchone() is not None:
            cursor.execute("ALTER TABLE users DROP COLUMN password")


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_auth_fields, remove_auth_fields),
    ]
