// Flujo Rediseñado desde Cero (Enfoque "The Mom Test")
// Sin etiquetas invasivas. Incentivo al inicio. Preguntas abiertas priorizadas.

const questions = {
    'q_welcome': {
        title: '¡Hola! Ayúdanos en este estudio sobre flujos de trabajo arquitectónicos.',
        subtitle: 'Te tomará solo 2 minutos. Al finalizar, recibirás gratis un Pack de 500 Bloques CAD Premium y entrarás al sorteo de S/50 por Yape.',
        type: 'singleselect',
        options: ['¡Empecemos!'],
        next: 'q_email'
    },
    'q_email': {
        title: 'Para enviarte tu regalo al terminar, ¿cuál es tu correo electrónico?',
        type: 'text',
        next: 'q_role'
    },
    'q_role': {
        title: '¿En qué área de la arquitectura o construcción trabajas principalmente hoy?',
        subtitle: 'Puedes seleccionar más de una.',
        type: 'multiselect',
        options: ['Estudiante / Academia', 'Diseño / Proyectos / BIM', 'Obra / Inspección / Peritaje', 'Revisión Normativa / Municipal'],
        next: 'q_tasks'
    },
    'q_tasks': {
        title: 'Pensando en tu día a día, ¿cuáles son tus tareas principales?',
        subtitle: 'Descríbelas brevemente con tus propias palabras.',
        type: 'textarea',
        next: 'q_tech'
    },
    'q_tech': {
        title: '¿Qué programas o herramientas utilizas con mayor frecuencia en esas tareas?',
        type: 'multiselect',
        options: ['AutoCAD', 'SketchUp', 'Revit / ArchiCAD', 'Excel / Word', 'WhatsApp (para coordinar)', 'Otro'],
        next: 'q_hate'
    },
    'q_hate': {
        title: 'De todas tus tareas, ¿cuál es el trabajo repetitivo que menos te gusta hacer?',
        subtitle: 'O el que más tiempo te demanda en la semana.',
        type: 'textarea',
        next: 'q_manual'
    },
    'q_manual': {
        title: '¿Hay alguna tarea que debas hacer manualmente porque el programa que usas se equivoca o no lo hace bien?',
        subtitle: 'Selecciona la que más te ocurra (esto nos ayuda a entender los cuellos de botella de software).',
        type: 'singleselect',
        options: [
            'Limpiar líneas superpuestas al pasar un 3D a 2D',
            'Organizar fotos de obra y redactar reportes',
            'Filtrar colisiones falsas en modelos BIM',
            'Cruzar planos con la normativa (RNE) a mano',
            'Redibujar o calcar planos antiguos desde PDFs',
            'Medir in situ porque los planos As-Built no coinciden',
            'Otra tarea (la describiré luego)'
        ],
        next: (answers) => {
            const ans = answers['q_manual'][0];
            if (ans.includes('3D a 2D')) return 'f_cad';
            if (ans.includes('fotos de obra')) return 'f_foto';
            if (ans.includes('colisiones falsas')) return 'f_bim';
            if (ans.includes('normativa (RNE)')) return 'f_rne';
            if (ans.includes('calcar planos')) return 'f_raster';
            if (ans.includes('As-Built')) return 'f_asbuilt';
            return 'q_magic';
        }
    },

    // --- FOLLOW UPS INVISIBLES (Solo ven una según su respuesta anterior) ---
    'f_cad': {
        title: 'Sobre esa exportación de 3D a 2D: ¿Qué técnica usas para limpiar el dibujo (ej. OVERKILL) y cuánto tiempo te toma por entrega?',
        type: 'textarea',
        next: 'q_magic'
    },
    'f_foto': {
        title: 'Sobre los reportes: ¿Sueles tener problemas perdiendo el contexto o la fecha/GPS al pasar las fotos por WhatsApp o al ordenador?',
        type: 'textarea',
        next: 'q_magic'
    },
    'f_bim': {
        title: 'Sobre las colisiones BIM: ¿Aproximadamente qué porcentaje de las alertas que revisas terminan siendo "falsos positivos" irrelevantes?',
        type: 'textarea',
        next: 'q_magic'
    },
    'f_rne': {
        title: 'Sobre la normativa: ¿Qué tan tedioso es transcribir o buscar los artículos exactos del RNE para justificar tus observaciones?',
        type: 'textarea',
        next: 'q_magic'
    },
    'f_raster': {
        title: 'Sobre el calco de PDFs: ¿Alguna vez un polígono mal cerrado por calcar a mano te ha arruinado el cálculo de áreas o sombreados?',
        type: 'textarea',
        next: 'q_magic'
    },
    'f_asbuilt': {
        title: 'Sobre los levantamientos: ¿Cuánto tiempo extra te toma medir y redibujar la realidad frente al tiempo de tu trabajo de diseño original?',
        type: 'textarea',
        next: 'q_magic'
    },

    // --- CIERRE (Mom Test) ---
    'q_magic': {
        title: 'Si existiera una herramienta que resolviera un único problema de tu trabajo, ¿qué debería hacer exactamente?',
        type: 'textarea',
        next: 'q_delegate'
    },
    'q_delegate': {
        title: '¿Qué tarea te gustaría delegar a un asistente mañana mismo si pudieras?',
        type: 'textarea',
        next: 'q_last_project'
    },
    'q_last_project': {
        title: 'Por último, háblame de tu último proyecto.',
        subtitle: '¿Cómo fue el proceso desde el inicio hasta la entrega?',
        type: 'textarea',
        next: 'end'
    }
};

let currentQuestionId = 'q_welcome'; // Nuevo inicio
const answers = {};
const historyStack = [];

const container = document.getElementById('question-container');
const btnNext = document.getElementById('btn-next');
const btnPrev = document.getElementById('btn-prev');
const progressBar = document.getElementById('progress-bar');
let totalQuestionsEstimate = 10;
let questionsAnswered = 0;

function renderQuestion() {
    const q = questions[currentQuestionId];
    
    container.classList.remove('fade-in');
    container.classList.add('fade-out');
    
    setTimeout(() => {
        let html = `<h2>${q.title}</h2>`;
        if (q.subtitle) html += `<p class="subtitle">${q.subtitle}</p>`;

        if (q.type === 'text') {
            html += `<input type="text" id="input_field" placeholder="Escribe tu respuesta..." value="${answers[currentQuestionId] || ''}" autofocus autocomplete="off">`;
        } else if (q.type === 'textarea') {
            html += `<textarea id="input_field" rows="3" placeholder="Escribe libremente aquí...">${answers[currentQuestionId] || ''}</textarea>`;
        } else if (q.type === 'multiselect' || q.type === 'singleselect') {
            html += `<div class="options-grid">`;
            const savedOptions = answers[currentQuestionId] || [];
            q.options.forEach(opt => {
                const isSelected = savedOptions.includes(opt) ? 'selected' : '';
                html += `<button class="option-btn ${isSelected}" onclick="handleOptionClick('${currentQuestionId}', '${opt}', '${q.type}', this)">${opt}</button>`;
            });
            html += `</div>`;
        }

        container.innerHTML = html;
        container.classList.remove('fade-out');
        container.classList.add('fade-in');
        
        btnPrev.style.display = historyStack.length > 0 ? 'block' : 'none';
        
        if(q.type === 'singleselect') {
            btnNext.style.display = 'none';
        } else {
            btnNext.style.display = 'block';
        }

        if (q.next === 'end') {
            btnNext.innerHTML = 'Enviar Respuestas y Reclamar Regalo ✓';
            btnNext.style.display = 'block'; 
        } else {
            btnNext.innerHTML = 'Continuar ➔';
        }

        progressBar.style.width = `${Math.min(100, (questionsAnswered / totalQuestionsEstimate) * 100)}%`;

        const inputElement = document.getElementById('input_field');
        if (inputElement && (q.type === 'text')) {
            inputElement.focus();
            inputElement.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') btnNext.click();
            });
        }
    }, 300);
}

window.handleOptionClick = function(qId, optValue, qType, btnElement) {
    if (qType === 'singleselect') {
        answers[qId] = [optValue];
        advanceToNext();
    } else {
        if (!answers[qId]) answers[qId] = [];
        const index = answers[qId].indexOf(optValue);
        
        if (index === -1) {
            answers[qId].push(optValue);
            btnElement.classList.add('selected');
        } else {
            answers[qId].splice(index, 1);
            btnElement.classList.remove('selected');
        }
    }
}

function saveTextAnswer() {
    const q = questions[currentQuestionId];
    if (q.type === 'text' || q.type === 'textarea') {
        const inputElement = document.getElementById('input_field');
        if(inputElement) answers[currentQuestionId] = inputElement.value.trim();
    }
}

function advanceToNext() {
    saveTextAnswer();
    
    const q = questions[currentQuestionId];
    if (q.next === 'end') {
        console.log("DATOS LISTOS PARA BASE DE DATOS:", JSON.stringify(answers, null, 2));
        container.innerHTML = `<h2>¡Formulario Enviado! 🎉</h2><p class="subtitle">Revisa tu bandeja de entrada en los próximos minutos para tu regalo. ¡Mil gracias por participar!</p>`;
        btnNext.style.display = 'none';
        btnPrev.style.display = 'none';
        progressBar.style.width = '100%';
        return;
    }

    historyStack.push(currentQuestionId);
    
    let nextId = '';
    if (typeof q.next === 'function') {
        nextId = q.next(answers);
    } else {
        nextId = q.next;
    }

    currentQuestionId = nextId;
    questionsAnswered++;
    renderQuestion();
}

btnNext.addEventListener('click', advanceToNext);

btnPrev.addEventListener('click', () => {
    saveTextAnswer();
    if (historyStack.length > 0) {
        currentQuestionId = historyStack.pop();
        questionsAnswered = Math.max(0, questionsAnswered - 1);
        renderQuestion();
    }
});

renderQuestion();
