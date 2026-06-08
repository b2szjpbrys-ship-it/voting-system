# Voting backend

Setup:

1. Create a virtualenv and install requirements:

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and adjust credentials.

3. Create MySQL database (example):

```sql
CREATE DATABASE voting_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL ON voting_app.* TO 'root'@'localhost' IDENTIFIED BY '1234';
FLUSH PRIVILEGES;
```

4. Run migrations and start server:

```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```
