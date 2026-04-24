import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('branches', '0001_initial'),
        ('hr', '0002_rename_dpi_extend_personnel'),
    ]

    operations = [
        migrations.AddField(
            model_name='personnelrecord',
            name='branch',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='personnel_records',
                to='branches.branch',
            ),
        ),
        migrations.CreateModel(
            name='VacationLeave',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo_empleado', models.CharField(max_length=32)),
                ('nombre_empleado', models.CharField(max_length=200)),
                ('tipo_periodo', models.CharField(default='Vacaciones', max_length=120)),
                ('fecha_salida', models.DateField()),
                ('fecha_regreso', models.DateField()),
                ('notas', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Permiso / vacaciones',
                'verbose_name_plural': 'Permisos y vacaciones',
                'ordering': ['-fecha_salida', '-id'],
            },
        ),
    ]
