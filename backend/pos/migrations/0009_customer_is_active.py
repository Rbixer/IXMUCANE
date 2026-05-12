from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0008_add_customer_nit_to_sale'),
    ]

    operations = [
        migrations.AddField(
            model_name='customer',
            name='is_active',
            field=models.BooleanField(
                default=True,
                help_text=(
                    'Soft-delete: si está en False el cliente queda oculto del listado.'
                ),
            ),
        ),
    ]
