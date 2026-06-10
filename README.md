# La Tortería - Sistema web para producción

Sistema para ventas, gastos, productos, cierres diarios, reportes, inventario y usuarios.

## Arquitectura actual

- `index.html`: pantallas del sistema, login y configuración inicial.
- `styles.css`: diseño responsive para celular, tablet y computadora.
- `app.js`: lógica de interfaz y comunicación con la API.
- `api/`: endpoints serverless para Vercel.
- `lib/`: conexión a base de datos, seguridad y sesiones.
- `plantilla-productos.xlsx`: plantilla para importar productos.
- PostgreSQL: base de datos persistente para usuarios, productos, ventas, gastos, inventario y cierres.

## Seguridad

Al primer uso no existe ningún usuario. El sistema muestra `Configuración Inicial - La Tortería` para crear el primer administrador.

Después:

- El acceso requiere login.
- Las contraseñas se guardan con hash PBKDF2.
- La sesión usa cookie `HttpOnly`.
- Administrador: acceso completo.
- Empleado: registra ventas, registra gastos y consulta información básica.

## Variables de entorno

Configura estas variables en Vercel:

```env
DATABASE_URL="postgresql://usuario:password@host/base?sslmode=require"
SESSION_SECRET="una-frase-larga-y-secreta"
```

## Despliegue en Vercel

1. Crea una cuenta en https://vercel.com.
2. Sube este proyecto a GitHub, GitLab o Bitbucket.
3. En Vercel, elige `Add New Project` e importa el repositorio.
4. En `Storage` o `Marketplace`, crea o conecta una base Postgres. Neon es una opción recomendada.
5. Copia la cadena de conexión a `DATABASE_URL`.
6. Agrega `SESSION_SECRET` con una frase larga.
7. Despliega el proyecto.
8. Abre la URL pública de Vercel.
9. Crea el administrador inicial.
10. Inicia sesión y comienza a cargar productos, ventas y gastos.

## Uso desde celular y computadora

La URL pública de Vercel funciona desde cualquier navegador moderno. Puedes abrirla en celular, tablet o computadora. Los datos quedan centralizados en la base de datos, no en un solo equipo.

## Productos

En el módulo `Productos` puedes:

- Crear productos manualmente.
- Editar productos.
- Desactivar productos.
- Importar productos desde Excel.
- Descargar `plantilla-productos.xlsx`.

Si importas un producto con un código existente, el sistema lo actualiza en lugar de duplicarlo.

## Nota importante

El archivo `index.html` ya no debe abrirse directamente con doble clic para uso real. Para producción debe ejecutarse en Vercel, porque la app necesita API y base de datos.
