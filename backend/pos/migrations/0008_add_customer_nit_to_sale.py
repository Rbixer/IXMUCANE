from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0007_add_amount_paid_to_sale'),
    ]

    operations = [
        migrations.AddField(
            model_name='sale',
            name='customer_nit',
            field=models.CharField(
                blank=True,
                default='',
                help_text='NIT del receptor para FEL (CF si está vacío).',
                max_length=80,
            ),
        ),
    ]
