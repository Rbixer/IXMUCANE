from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0003_personnel_branch_vacationleave'),
    ]

    operations = [
        migrations.AddField(
            model_name='personnelrecord',
            name='telefono',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
        migrations.AddField(
            model_name='personnelrecord',
            name='dpi',
            field=models.CharField(blank=True, db_index=True, max_length=32, null=True, unique=True),
        ),
    ]
