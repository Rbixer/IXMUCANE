from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('suppliers', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='supplier',
            name='nit',
            field=models.CharField(blank=True, default='', max_length=32, verbose_name='NIT'),
        ),
        migrations.AddField(
            model_name='supplier',
            name='razon_social',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Razón social'),
        ),
        migrations.AlterField(
            model_name='supplier',
            name='name',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='Nombre'),
        ),
    ]
