# Flujo Adaptativo de Entrevista (Máquina de Estados)

Router diseñado para guiar dinámicamente la entrevista (máximo 20 minutos) según el rol detectado en la primera pregunta, garantizando la extracción del pipeline operativo y fricciones de Input/Output (I/O) sin desviarse.

> **Nota:** La estructura lógica de esta máquina de estados se ha programado en un archivo JSON ubicado en `/home/cesar/Escritorio/UTEC/Emprendimiento/interview_states.json` para poder ser consumido por un formulario interactivo o agente conversacional.

## Ramas y Enfoques de Extracción I/O

### 1. Rama: Inspector / Supervisor de Obra
* **Contexto:** Su labor es 100% de contraste. El plano/expediente manda. Ellos documentan discrepancias (no conformidades), avances y liberaciones.
* **Pipeline a extraer:** Anclaje al expediente (Input) -> Captura de discrepancias en campo -> Fricción en gabinete al traducir la data -> Proporción de horas campo vs gabinete.

### 2. Rama: Residente de Obra / Contratista
* **Contexto:** El que ejecuta. Su enfoque es que la obra no pare, manejar el dinero (valorizaciones) y el personal. Buscamos conocer su stack actual y dónde "hace agua" su gestión.
* **Pipeline a extraer:** Gestión documental diaria -> Fricción logística (inventarios/pedidos) -> Cuello de botella financiero (armado de valorización) -> Control de cambios adicionales.

### 3. Rama: Proyectista / Diseñador
* **Contexto:** Dolor enfocado en el Input/Output de datos, compatibilización de especialidades y las iteraciones destructivas de diseño.
* **Pipeline a extraer:** Input mínimo para diseñar -> Fricción I/O en iteraciones de software (CAD/BIM) -> Generación manual del expediente de "relleno" -> Nivel de adopción tecnológica actual.

### 4. Rama: Perito / Tasador
* **Contexto:** Evaluación de bienes y tasación. Alta rigidez del proceso y formatos.
* **Pipeline a extraer:** Estandarización de campo -> Cuello de botella del estudio de mercado -> El dolor de formato (copiar y pegar) en el informe.

### 5. Rama: Consultor Técnico-Legal (Trámites)
* **Contexto:** Especialistas en lidiar con la burocracia estatal/municipal.
* **Pipeline a extraer:** Evaluación inicial de viabilidad -> Recopilación de expedientes (dolor burocrático de I/O) -> Fricción en el ensamblaje de la licencia -> Seguimiento municipal.

---

## Bloques Obligatorios Transversales
Independiente de la rama elegida, se debe buscar:
1. **Flujo paso a paso** (cuantificando el tiempo perdido).
2. **Mom Test:** ¿Cuánto tiempo le toma realmente? ¿Qué parche usa actualmente? ¿Paga por ese parche?
3. **Escalabilidad:** Identificar la desproporción del esfuerzo entre el trabajo de valor vs el trabajo administrativo.
