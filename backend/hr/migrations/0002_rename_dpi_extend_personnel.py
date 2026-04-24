from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hr', '0001_initial'),
    ]

    operations = [
        migrations.RenameField(
            model_name='personnelrecord',
            old_name='dpi',
            new_name='codigo',
        ),
        migrations.AddField(
            model_name='personnelrecord',
            name='apellidos',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='personnelrecord',
            name='fecha_nacimiento',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='personnelrecord',
            name='direccion_domicilio',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AlterModelOptions(
            name='personnelrecord',
            options={
                'ordering': ['nombre', 'apellidos'],
                'verbose_name': 'Registro de personal',
                'verbose_name_plural': 'Registros de personal',
            },
        ),
    ]
