from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0002_quote_quoteline'),
    ]

    operations = [
        migrations.CreateModel(
            name='Customer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('phone', models.CharField(blank=True, default='', max_length=40)),
                ('email', models.EmailField(blank=True, default='', max_length=254)),
                ('address', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name', 'id'],
            },
        ),
        migrations.AddField(
            model_name='sale',
            name='customer',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='sales', to='pos.customer'),
        ),
        migrations.AddField(
            model_name='sale',
            name='customer_address',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='sale',
            name='customer_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.AddField(
            model_name='sale',
            name='customer_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='sale',
            name='customer_phone',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
    ]
