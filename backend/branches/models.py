from django.db import models

class Branch(models.Model):
    name = models.CharField(max_length=120)
    city = models.CharField(max_length=100)
    address = models.CharField(max_length=255)
    maps_url = models.CharField(
        max_length=800,
        blank=True,
        default='',
        help_text='Enlace o URL corta de Google Maps (compartir ubicacion de la sucursal).',
    )
    manager = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} - {self.city}'
