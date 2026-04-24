from django.db import migrations, models
import django.db.models.deletion


def clear_grants(apps, schema_editor):
    SystemVerificationGrant = apps.get_model('authentication', 'SystemVerificationGrant')
    SystemVerificationGrant.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0003_personnel_branch_vacationleave'),
        ('authentication', '0001_systemverificationgrant'),
    ]

    operations = [
        migrations.RunPython(clear_grants, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='systemverificationgrant',
            name='user',
        ),
        migrations.AddField(
            model_name='systemverificationgrant',
            name='personnel',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='system_verification_grant',
                to='hr.personnelrecord',
            ),
        ),
    ]
