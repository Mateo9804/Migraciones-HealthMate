-- Script para exportar todas las tablas de una base de datos a CSV
-- Ejecuta este script en SSMS después de restaurar la base de datos

-- Cambia 'bkprogram1' por el nombre de tu base de datos
USE bkprogram1;
GO

-- Ver todas las tablas disponibles
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;
GO

-- Para exportar cada tabla, ejecuta estos comandos uno por uno
-- O usa el método manual: Click derecho en tabla → Select Top 1000 Rows → Save Results As...

-- Ejemplo para exportar tabla PACIENTE:
-- SELECT * FROM PACIENTE;
-- (Luego click derecho en resultados → Save Results As... → CSV)

-- Ejemplo para exportar tabla PACIENTE_BONOS:
-- SELECT * FROM PACIENTE_BONOS;
-- (Luego click derecho en resultados → Save Results As... → CSV)

-- Ejemplo para exportar tabla CITA_PACIENTE:
-- SELECT * FROM CITA_PACIENTE;
-- (Luego click derecho en resultados → Save Results As... → CSV)

