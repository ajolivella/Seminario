/* ==========================================================================
   Uparsistem · Seminario "Tu imagen, tu oportunidad"
   Etapa 2: Interactividad de Landing Page + Validación y envío a Supabase
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initFaqAccordion();
  initPolicyModal();
  initRegistrationForm();
});

function initMobileNav() {
  const toggleBtn = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  if (!toggleBtn || !navLinks) return;

  toggleBtn.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('is-open');
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('is-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  });
}

function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const button = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    if (!button || !answer) return;

    button.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      faqItems.forEach((other) => {
        other.classList.remove('is-open');
        const otherBtn = other.querySelector('.faq-question');
        const otherAnswer = other.querySelector('.faq-answer');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        if (otherAnswer) otherAnswer.style.maxHeight = null;
      });

      if (!isOpen) {
        item.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = answer.scrollHeight + 'px';
      }
    });
  });
}

function initPolicyModal() {
  const modal = document.getElementById('policyModal');
  const closeBtn = document.getElementById('closePolicyBtn');
  const openButtons = document.querySelectorAll('[data-open-policy]');

  if (!modal || !closeBtn) return;

  const openModal = () => {
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    document.body.style.overflow = '';
  };

  openButtons.forEach((btn) => btn.addEventListener('click', openModal));
  closeBtn.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });
}

function getSupabaseClient() {
  const cfg = window.SEMINARIO_CONFIG;
  if (!window.supabase || !cfg || !cfg.supabaseUrl || !cfg.supabasePublicKey) {
    return null;
  }
  const cleanUrl = cfg.supabaseUrl.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
  return window.supabase.createClient(cleanUrl, cfg.supabasePublicKey);
}

function setFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`error-${fieldId}`);
  if (input && input.type !== 'checkbox') {
    input.classList.toggle('is-invalid', Boolean(message));
  }
  if (errorEl) {
    errorEl.textContent = message || '';
  }
}

function clearAllErrors(fieldIds) {
  fieldIds.forEach((id) => setFieldError(id, ''));
}

function validateRegistrationValues(values) {
  const errors = {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  if (!values.nombres || values.nombres.length < 2) {
    errors.nombres = 'Ingresa tus nombres (mínimo 2 caracteres).';
  }

  if (!values.apellidos || values.apellidos.length < 2) {
    errors.apellidos = 'Ingresa tus apellidos (mínimo 2 caracteres).';
  }

  if (!values.tipo_documento) {
    errors.tipo_documento = 'Selecciona tu tipo de documento.';
  }

  if (!values.numero_documento) {
    errors.numero_documento = 'Ingresa tu número de documento.';
  } else if (!/^\d+$/.test(values.numero_documento)) {
    errors.numero_documento = 'El número de documento debe contener solo números.';
  } else if (values.numero_documento.length < 5) {
    errors.numero_documento = 'El número de documento debe tener al menos 5 dígitos.';
  }

  if (!values.correo) {
    errors.correo = 'Ingresa tu correo electrónico.';
  } else if (!emailRegex.test(values.correo)) {
    errors.correo = 'Ingresa un correo electrónico válido (ej. nombre@correo.com).';
  }

  if (!values.celular) {
    errors.celular = 'Ingresa tu número de celular.';
  } else if (!/^\d{10}$/.test(values.celular)) {
    errors.celular = 'El celular debe tener exactamente 10 dígitos numéricos.';
  }

  if (!values.ciudad || values.ciudad.length < 2) {
    errors.ciudad = 'Ingresa tu ciudad de residencia.';
  }

  if (!values.situacion_actual) {
    errors.situacion_actual = 'Selecciona tu situación actual.';
  }

  if (!values.acepta_datos) {
    errors.acepta_datos = 'Debes autorizar el tratamiento de datos personales para inscribirte.';
  }

  return errors;
}

function showFormFeedback(type, message) {
  const feedback = document.getElementById('formFeedback');
  if (!feedback) return;
  feedback.className = `form-feedback is-visible is-${type}`;
  feedback.textContent = message;
}

function hideFormFeedback() {
  const feedback = document.getElementById('formFeedback');
  if (!feedback) return;
  feedback.className = 'form-feedback';
  feedback.textContent = '';
}

function initRegistrationForm() {
  const form = document.getElementById('registrationForm');
  const submitBtn = document.getElementById('submitBtn');
  if (!form || !submitBtn) return;

  const fieldIds = [
    'nombres',
    'apellidos',
    'tipo_documento',
    'numero_documento',
    'correo',
    'celular',
    'ciudad',
    'situacion_actual',
    'programa_institucion',
    'como_se_entero',
    'acepta_datos'
  ];

  // Limpiar error al editar cada campo
  fieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const eventName = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, () => {
      setFieldError(id, '');
      hideFormFeedback();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormFeedback();
    clearAllErrors(fieldIds);

    const rawValues = {
      nombres: document.getElementById('nombres').value.trim(),
      apellidos: document.getElementById('apellidos').value.trim(),
      tipo_documento: document.getElementById('tipo_documento').value.trim(),
      numero_documento: document.getElementById('numero_documento').value.trim(),
      correo: document.getElementById('correo').value.trim().toLowerCase(),
      celular: document.getElementById('celular').value.trim(),
      ciudad: document.getElementById('ciudad').value.trim(),
      situacion_actual: document.getElementById('situacion_actual').value.trim(),
      programa_institucion: document.getElementById('programa_institucion').value.trim(),
      como_se_entero: document.getElementById('como_se_entero').value.trim(),
      acepta_datos: document.getElementById('acepta_datos').checked
    };

    const errors = validateRegistrationValues(rawValues);
    const errorKeys = Object.keys(errors);

    if (errorKeys.length > 0) {
      errorKeys.forEach((key) => setFieldError(key, errors[key]));
      showFormFeedback('error', 'Por favor revisa los campos señalados antes de continuar.');
      const firstInvalid = document.getElementById(errorKeys[0]);
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) {
      showFormFeedback(
        'error',
        'No se pudo inicializar la conexión con Supabase. Verifica el archivo config.js y tu conexión a internet.'
      );
      return;
    }

    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando inscripción...';

    try {
      const payload = {
        nombres: rawValues.nombres,
        apellidos: rawValues.apellidos,
        tipo_documento: rawValues.tipo_documento,
        numero_documento: rawValues.numero_documento,
        correo: rawValues.correo,
        celular: rawValues.celular,
        ciudad: rawValues.ciudad,
        situacion_actual: rawValues.situacion_actual,
        programa_institucion: rawValues.programa_institucion || null,
        como_se_entero: rawValues.como_se_entero || null,
        acepta_datos: rawValues.acepta_datos
      };

      const { error } = await supabaseClient.from('inscripciones').insert([payload]);

      if (error) {
        const msgLower = (error.message || '').toLowerCase();
        const code = error.code || '';

        if (code === '23505' || msgLower.includes('duplicate') || msgLower.includes('unique')) {
          setFieldError('numero_documento', 'Este documento ya está inscrito');
          showFormFeedback('error', 'Este documento ya está inscrito');
          document.getElementById('numero_documento').focus();
        } else if (code === '42501' || msgLower.includes('row-level security')) {
          showFormFeedback(
            'error',
            `Falta el permiso de seguridad (RLS) para guardar inscripciones. Ejecuta completo el archivo supabase_setup.sql en Supabase → SQL Editor. (Detalle: ${code || 'RLS'} - ${error.message})`
          );
        } else if (code === '42P01' || code === 'PGRST205' || msgLower.includes('does not exist')) {
          showFormFeedback(
            'error',
            `La tabla "inscripciones" no se encontró en Supabase. Ejecuta el archivo supabase_setup.sql en SQL Editor. (Detalle: ${code} - ${error.message})`
          );
        } else if (code === 'PGRST204' || code === '42703') {
          showFormFeedback(
            'error',
            `Alguna columna de la tabla "inscripciones" no coincide con el formulario. Revisa o vuelve a crear la tabla con supabase_setup.sql. (Detalle: ${code} - ${error.message})`
          );
        } else {
          showFormFeedback(
            'error',
            `Ocurrió un problema al guardar tu inscripción. (Detalle: ${code || 'sin código'} - ${error.message || 'error desconocido'})`
          );
        }
        console.error('Error Supabase al insertar:', error);
        return;
      }

      form.reset();
      showFormFeedback(
        'success',
        '¡Inscripción confirmada! Te esperamos el 30 de noviembre a las 8:00 a. m. en el Auditorio 1 de Uparsistem'
      );
    } catch (err) {
      console.error('Error inesperado al enviar el formulario:', err);
      showFormFeedback(
        'error',
        'No fue posible conectarse con el servidor. Verifica tu conexión a internet e intenta de nuevo.'
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}
