from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0009_customer_is_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='sale',
            name='is_envio',
            field=models.BooleanField(
                default=False,
                help_text=(
                    'Si está activo la venta se procesa como ENVÍO/recibo y NO se '
                    'certifica en FEL automáticamente.'
                ),
            ),
        ),
    ]
