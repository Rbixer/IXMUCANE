from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Quote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('customer_name', models.CharField(blank=True, default='', max_length=200)),
                ('customer_nit', models.CharField(blank=True, default='', max_length=80)),
                ('notes', models.TextField(blank=True, default='')),
                ('total', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='QuoteLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.PositiveIntegerField()),
                (
                    'unit_kind',
                    models.CharField(
                        choices=[('unit', 'Unidad'), ('package', 'Paquete'), ('fardo', 'Fardo')],
                        default='unit',
                        max_length=16,
                    ),
                ),
                ('line_unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    'inventory_item',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='quote_lines',
                        to='inventory.inventoryitem',
                    ),
                ),
                (
                    'quote',
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='pos.quote'),
                ),
            ],
            options={
                'ordering': ['id'],
            },
        ),
    ]
