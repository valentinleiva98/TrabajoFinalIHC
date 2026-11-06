/**
 * ==========================================================================
 * TABLERO DIGITAL DE OBJETOS PERDIDOS - UNSE (IHC 2026)
 * Archivo: app.js
 * Responsabilidad:
 * 1. Autenticación de usuarios UNSE, registro y envío de correo real con código de 6 dígitos (EmailJS API).
 * 2. Control de Acceso Basado en Roles (RBAC): Visitante, Usuario Verificado y Admin.
 * 3. Registro de particularidades privadas al publicar un hallazgo (ocultas al público y visibles solo para el Admin).
 * 4. Verificación cruzada de reclamos por el Admin (Coincide -> Devolver a la persona indicada / No coincide -> Descartar).
 * 5. Administración dinámica de Categorías, Lugares de hallazgo, Puntos de retiro, Usuarios y Correo (Solo Admin).
 * ==========================================================================
 */

const STORAGE_KEYS = {
  OBJETOS: "unse_objetos_perdidos_v2",
  USUARIOS: "unse_usuarios_v2",
  SESION: "unse_sesion_activa_v2",
  CATEGORIAS: "unse_categorias_v2",
  LUGARES: "unse_lugares_v2",
  RETIROS: "unse_retiros_v2",
  EMAILJS: "unse_emailjs_config_v2"
};

/**
 * Credenciales por defecto de EmailJS configuradas permanentemente en el proyecto.
 */
const EMAILJS_POR_DEFECTO = {
  serviceId: "service_46vbbig",
  templateId: "template_6a91pbc",
  publicKey: "2WI_OlShz7MstgQpe"
};

/* ==========================================================================
   CATÁLOGOS INICIALES POR DEFECTO (Administrables por el Admin)
   ========================================================================== */
const CATEGORIAS_INICIALES = [
  { nombre: "Cargadores", icono: "🔌", fondo: "#dbeafe", borde: "#1d4ed8" },
  { nombre: "Cuadernos", icono: "📓", fondo: "#fef3c7", borde: "#b45309" },
  { nombre: "Ropa", icono: "🧥", fondo: "#fce7f3", borde: "#be185d" },
  { nombre: "Llaves", icono: "🔑", fondo: "#fef9c3", borde: "#a16207" },
  { nombre: "Botellas", icono: "🧉", fondo: "#dcfce7", borde: "#15803d" },
  { nombre: "Otros", icono: "🎒", fondo: "#f3e8ff", borde: "#6d28d9" }
];

const LUGARES_INICIALES = [
  "Aulas",
  "Laboratorios",
  "Biblioteca",
  "Pasillos / Patio",
  "Cantina / Comedor",
  "Baños"
];

const RETIROS_INICIALES = [
  "Conserjería Central",
  "Centro de Estudiantes",
  "Recepción de Biblioteca",
  "Secretaría / Bedelía",
  "Lo tengo conmigo (ver descripción)"
];

const USUARIOS_INICIALES = [
  {
    id: "usr-admin-1",
    nombre: "Administrador",
    apellido: "General UNSE",
    correo: "admin@unse.edu.ar",
    password: "admin",
    facultad: "Personal No Docente / Conserjería",
    carrera: "Administración y Moderación del Tablero",
    rol: "admin",
    verificado: true
  },
  {
    id: "usr-est-1",
    nombre: "Valentín",
    apellido: "Leiva",
    correo: "valentin@alu.unse.edu.ar",
    password: "123456",
    facultad: "FCEyT (Ciencias Exactas y Tecnologías)",
    carrera: "Licenciatura en Sistemas de Información",
    rol: "usuario",
    verificado: true
  }
];

/* ==========================================================================
   SANITIZACIÓN Y GENERADOR DE ILUSTRACIONES SVG
   ========================================================================== */
function escaparHTML(texto) {
  if (!texto) return "";
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function obtenerConfigCategoria(nombreCategoria) {
  const encontrada = categoriasSistema.find((c) => c.nombre === nombreCategoria);
  if (encontrada) return encontrada;
  return {
    nombre: nombreCategoria || "Otros",
    icono: "📦",
    fondo: "#e2e8f0",
    borde: "#475569"
  };
}

function generarImagenCategoria(categoria, tituloCorto) {
  const conf = obtenerConfigCategoria(categoria);
  const textoSeguro = escaparHTML((tituloCorto || categoria).slice(0, 32));

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
      <rect width="600" height="400" fill="${conf.fondo || "#dbeafe"}" />
      <rect x="20" y="20" width="560" height="360" rx="20" fill="none" stroke="${conf.borde || "#1d4ed8"}" stroke-width="4" stroke-dasharray="10 8" opacity="0.45" />
      <text x="300" y="185" font-size="96" text-anchor="middle" dominant-baseline="middle">${conf.icono || "📦"}</text>
      <text x="300" y="285" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#0f172a" text-anchor="middle">${textoSeguro}</text>
      <text x="300" y="320" font-family="system-ui, sans-serif" font-size="16" fill="#334155" text-anchor="middle">Categoría: ${escaparHTML(categoria)}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* ==========================================================================
   ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================== */
let categoriasSistema = [...CATEGORIAS_INICIALES];
let lugaresSistema = [...LUGARES_INICIALES];
let retirosSistema = [...RETIROS_INICIALES];
let configEmailJS = { ...EMAILJS_POR_DEFECTO };

let listaUsuarios = [];
let usuarioActual = null;
let usuarioPendienteVerificacion = null;

let listaObjetos = [];
let objetoSeleccionadoId = null;
let objetoEditandoId = null;
let reclamoPreseleccionadoId = null;
let imagenTemporalBase64 = null;

const filtrosActivos = {
  busqueda: "",
  categoria: "todos",
  lugar: "todos",
  retiro: "todos",
  estado: "todos",
  fechaDesde: "",
  filtroPersonal: "todos" // "todos" | "mis_publicaciones" | "mis_reclamos"
};

function crearObjetosIniciales() {
  return [
    {
      id: "obj-101",
      titulo: "Cargador Samsung blanco USB Tipo-C",
      categoria: "Cargadores",
      descripcion: "Estaba enchufado en el tomacorriente del fondo del Aula 12 después de la clase de la mañana.",
      particularidadesHallazgo: "En el cabezal blanco tiene una marquita con esmalte azul y el cable mide 1.5m.",
      lugarEncontrado: "Aulas",
      lugarRetiro: "Conserjería Central",
      fecha: "2026-11-05",
      estado: "encontrado",
      imagen: generarImagenCategoria("Cargadores", "Cargador Samsung USB-C"),
      altText: "Fotografía ilustrativa de Cargador Samsung blanco USB Tipo-C encontrado en Aulas",
      publicadoPor: "Valentín Leiva · FCEyT (Lic. en Sistemas de Información)",
      publicadoPorCorreo: "valentin@alu.unse.edu.ar",
      reclamos: [
        {
          idReclamo: "rec-1",
          duenioDeclarado: "Mirian Baigorria",
          usuarioNombre: "Mirian Baigorria",
          usuarioCorreo: "mirian.baigorria@alu.unse.edu.ar",
          usuarioFacultad: "FCEyT (Ciencias Exactas y Tecnologías)",
          usuarioCarrera: "Licenciatura en Sistemas de Información",
          contacto: "385 4889900",
          particularidades: "En el cabezal blanco tiene una marquita con esmalte azul para no confundirlo y el cable mide 1.5 metros.",
          fechaReclamo: "05/11/2026"
        }
      ],
      datosEntrega: null
    },
    {
      id: "obj-102",
      titulo: "Termo de acero inoxidable con stickers",
      categoria: "Botellas",
      descripcion: "Quedó sobre una de las mesas de madera cerca de la fotocopiadora.",
      particularidadesHallazgo: "Tiene un sticker de la selección argentina y otro de programación en la base.",
      lugarEncontrado: "Pasillos / Patio",
      lugarRetiro: "Centro de Estudiantes",
      fecha: "2026-11-04",
      estado: "encontrado",
      imagen: generarImagenCategoria("Botellas", "Termo con stickers"),
      altText: "Fotografía ilustrativa de Termo de acero inoxidable encontrado en Pasillos / Patio",
      publicadoPor: "Enzo Vera · FCEyT (Lic. en Sistemas de Información)",
      publicadoPorCorreo: "enzo.vera@alu.unse.edu.ar",
      reclamos: [],
      datosEntrega: null
    },
    {
      id: "obj-103",
      titulo: "Cuaderno universitario A4 tapa azul de Análisis Matemático",
      categoria: "Cuadernos",
      descripcion: "Cuaderno espiralado marca Éxito en la mesa de lectura silenciosa de la biblioteca.",
      particularidadesHallazgo: "En la primera hoja figura el nombre del alumno y horarios de cursada del 1er cuatrimestre.",
      lugarEncontrado: "Biblioteca",
      lugarRetiro: "Recepción de Biblioteca",
      fecha: "2026-11-04",
      estado: "encontrado",
      imagen: generarImagenCategoria("Cuadernos", "Cuaderno A4 Azul"),
      altText: "Fotografía ilustrativa de Cuaderno universitario A4 tapa azul encontrado en Biblioteca",
      publicadoPor: "Personal de Biblioteca · UNSE",
      publicadoPorCorreo: "admin@unse.edu.ar",
      reclamos: [],
      datosEntrega: null
    },
    {
      id: "obj-104",
      titulo: "Llavero con cinta y 3 llaves de bronce",
      categoria: "Llaves",
      descripcion: "Encontrado al lado del teclado de la PC N° 8 en el Laboratorio de Informática 2.",
      particularidadesHallazgo: "Cinta roja con inscripción y una llave magnética negra.",
      lugarEncontrado: "Laboratorios",
      lugarRetiro: "Conserjería Central",
      fecha: "2026-11-03",
      estado: "encontrado",
      imagen: generarImagenCategoria("Llaves", "Llavero 3 llaves"),
      altText: "Fotografía ilustrativa de Llavero con 3 llaves encontrado en Laboratorios",
      publicadoPor: "Valentín Leiva · FCEyT (Lic. en Sistemas de Información)",
      publicadoPorCorreo: "valentin@alu.unse.edu.ar",
      reclamos: [],
      datosEntrega: null
    },
    {
      id: "obj-105",
      titulo: "Campera de abrigo negra talle M",
      categoria: "Ropa",
      descripcion: "Olvidada en el respaldo de una silla del comedor universitario al mediodía.",
      particularidadesHallazgo: "En el bolsillo interno izquierdo tiene un ticket de colectivo y un llavero metálico.",
      lugarEncontrado: "Cantina / Comedor",
      lugarRetiro: "Conserjería Central",
      fecha: "2026-11-02",
      estado: "recuperado",
      imagen: generarImagenCategoria("Ropa", "Campera negra talle M"),
      altText: "Fotografía ilustrativa de Campera de abrigo negra talle M encontrada en Cantina / Comedor",
      publicadoPor: "Conserjería Central · UNSE",
      publicadoPorCorreo: "admin@unse.edu.ar",
      reclamos: [],
      datosEntrega: {
        destinatario: "Enzo Vera · FCEyT (Lic. en Sistemas de Información) - enzo.vera@alu.unse.edu.ar",
        particularidadesVerificadas: "Verificó que en el bolsillo interno izquierdo tenía un ticket de colectivo y un llavero metálico.",
        fechaEntrega: "03/11/2026"
      }
    },
    {
      id: "obj-106",
      titulo: "Calculadora científica Casio fx-95MS con tapa gris",
      categoria: "Otros",
      descripcion: "Encontrada en el primer banco frente al escritorio docente del Aula 5.",
      particularidadesHallazgo: "En el dorso tiene grabadas las iniciales 'M.B.' con corrector blanco.",
      lugarEncontrado: "Aulas",
      lugarRetiro: "Secretaría / Bedelía",
      fecha: "2026-11-05",
      estado: "encontrado",
      imagen: generarImagenCategoria("Otros", "Calculadora Casio fx-95MS"),
      altText: "Fotografía ilustrativa de Calculadora científica Casio fx-95MS encontrada en Aulas",
      publicadoPor: "Docente Cátedra IHC · FCEyT",
      publicadoPorCorreo: "admin@unse.edu.ar",
      reclamos: [],
      datosEntrega: null
    }
  ];
}

/* ==========================================================================
   REFERENCIAS A ELEMENTOS DEL DOM
   ========================================================================== */
// Cabecera y Sesión
const vistaNoAutenticado = document.getElementById("vista-no-autenticado");
const vistaAutenticado = document.getElementById("vista-autenticado");
const btnAbrirAuth = document.getElementById("btn-abrir-auth");
const badgeRolUsuario = document.getElementById("badge-rol-usuario");
const nombreUsuarioActivo = document.getElementById("nombre-usuario-activo");
const facultadUsuarioActivo = document.getElementById("facultad-usuario-activo");
const btnAbrirAdmin = document.getElementById("btn-abrir-admin");
const btnCerrarSesion = document.getElementById("btn-cerrar-sesion");

// Contadores rápidos de estado (Pendientes, Reclamos, Entregados)
const statPendientes = document.getElementById("stat-pendientes");
const statReclamos = document.getElementById("stat-reclamos");
const statRecuperados = document.getElementById("stat-recuperados");
const numPendientes = document.getElementById("num-pendientes");
const numReclamos = document.getElementById("num-reclamos");
const numRecuperados = document.getElementById("num-recuperados");

// Barra de Actividad Personal del Usuario Logueado
const barraActividadUsuario = document.getElementById("barra-actividad-usuario");
const btnFiltroMisPublicaciones = document.getElementById("btn-filtro-mis-publicaciones");
const btnFiltroMisReclamos = document.getElementById("btn-filtro-mis-reclamos");
const btnQuitarFiltroPersonal = document.getElementById("btn-quitar-filtro-personal");
const numMisPublicaciones = document.getElementById("num-mis-publicaciones");
const numMisReclamos = document.getElementById("num-mis-reclamos");

// Filtros y Galería
const inputBusqueda = document.getElementById("input-busqueda");
const btnLimpiarBusqueda = document.getElementById("btn-limpiar-busqueda");
const contenedorChipsCategorias = document.getElementById("contenedor-chips-categorias");
const selectLugar = document.getElementById("select-lugar");
const selectRetiro = document.getElementById("select-retiro");
const selectEstado = document.getElementById("select-estado");
const inputFechaFiltro = document.getElementById("input-fecha-filtro");
const btnResetFiltros = document.getElementById("btn-reset-filtros");
const btnRestaurarDemo = document.getElementById("btn-restaurar-demo");

const contadorResultados = document.getElementById("contador-resultados");
const grillaObjetos = document.getElementById("grilla-objetos");
const estadoVacio = document.getElementById("estado-vacio");

// Modal de Autenticación y Verificación
const modalAuth = document.getElementById("modal-auth");
const btnCerrarAuth = document.getElementById("btn-cerrar-auth");
const tabsAuth = document.getElementById("tabs-auth");
const tabBtnLogin = document.getElementById("tab-btn-login");
const tabBtnRegistro = document.getElementById("tab-btn-registro");
const formLogin = document.getElementById("form-login");
const formRegistro = document.getElementById("form-registro");
const vistaVerificacion = document.getElementById("vista-verificacion");

const loginCorreo = document.getElementById("login-correo");
const loginPassword = document.getElementById("login-password");
const errorLogin = document.getElementById("error-login");

const regNombre = document.getElementById("reg-nombre");
const regApellido = document.getElementById("reg-apellido");
const regCorreo = document.getElementById("reg-correo");
const regFacultad = document.getElementById("reg-facultad");
const regCarrera = document.getElementById("reg-carrera");
const regPassword = document.getElementById("reg-password");
const errorRegistro = document.getElementById("error-registro");
const btnSubmitRegistro = document.getElementById("btn-submit-registro");

const verifNombreDestinatario = document.getElementById("verif-nombre-destinatario");
const verifCorreoDestinatario = document.getElementById("verif-correo-destinatario");
const estadoEnvioCorreo = document.getElementById("estado-envio-correo");
const formVerificarCodigo = document.getElementById("form-verificar-codigo");
const inputCodigoVerificacion = document.getElementById("input-codigo-verificacion");
const errorVerificacion = document.getElementById("error-verificacion");
const btnReenviarCodigo = document.getElementById("btn-reenviar-codigo");

// Modal de Publicación / Edición
const btnAbrirPublicar = document.getElementById("btn-abrir-publicar");
const modalPublicar = document.getElementById("modal-publicar");
const tituloModalPublicar = document.getElementById("titulo-modal-publicar");
const publicadorActualInfo = document.getElementById("publicador-actual-info");
const btnCerrarPublicar = document.getElementById("btn-cerrar-publicar");
const btnCancelarPublicar = document.getElementById("btn-cancelar-publicar");
const btnSubmitPublicar = document.getElementById("btn-submit-publicar");
const formPublicar = document.getElementById("form-publicar");
const inputFoto = document.getElementById("input-foto");
const previewFotoContainer = document.getElementById("preview-foto-container");
const imgPreview = document.getElementById("img-preview");
const btnQuitarFoto = document.getElementById("btn-quitar-foto");
const contenedorRadiosCategorias = document.getElementById("contenedor-radios-categorias");
const inputLugarEncontrado = document.getElementById("input-lugar-encontrado");
const inputLugarRetiro = document.getElementById("input-lugar-retiro");
const inputTitulo = document.getElementById("input-titulo");
const inputDetalleLugar = document.getElementById("input-detalle-lugar");
const inputFechaEncontrado = document.getElementById("input-fecha-encontrado");
const inputParticularidadesHallazgo = document.getElementById("input-particularidades-hallazgo");
const mensajeErrorForm = document.getElementById("mensaje-error-form");

// Modal de Detalle, Reclamo y Gestión Admin
const modalDetalle = document.getElementById("modal-detalle");
const btnCerrarDetalle = document.getElementById("btn-cerrar-detalle");
const detalleCategoriaBadge = document.getElementById("detalle-categoria-badge");
const detalleEstadoBadge = document.getElementById("detalle-estado-badge");
const contenedorDetalleImagen = document.getElementById("contenedor-detalle-imagen");
const detalleImagen = document.getElementById("detalle-imagen");
const btnZoomImagen = document.getElementById("btn-zoom-imagen");
const detalleTitulo = document.getElementById("detalle-titulo");
const detalleDescripcion = document.getElementById("detalle-descripcion");
const detalleLugarEncontrado = document.getElementById("detalle-lugar-encontrado");
const detalleFecha = document.getElementById("detalle-fecha");
const detalleLugarRetiro = document.getElementById("detalle-lugar-retiro");
const detallePublicadoPor = document.getElementById("detalle-publicado-por");

const cajaAutorPublicacion = document.getElementById("caja-autor-publicacion");
const autorParticularidadSecretaTexto = document.getElementById("autor-particularidad-secreta-texto");
const btnEditarPublicacion = document.getElementById("btn-editar-publicacion");

const cajaDatosEntrega = document.getElementById("caja-datos-entrega");
const textoEntregadoA = document.getElementById("texto-entregado-a");
const textoParticularidadesVerificadas = document.getElementById("texto-particularidades-verificadas");
const textoFechaEntrega = document.getElementById("texto-fecha-entrega");
const btnImprimirComprobante = document.getElementById("btn-imprimir-comprobante");

const seccionReclamoUsuario = document.getElementById("seccion-reclamo-usuario");
const miReclamoEnviadoBox = document.getElementById("mi-reclamo-enviado-box");
const miReclamoDetalleTexto = document.getElementById("mi-reclamo-detalle-texto");
const btnEditarMiReclamo = document.getElementById("btn-editar-mi-reclamo");
const bannerIniciarReclamo = document.getElementById("banner-iniciar-reclamo");
const btnAbrirFormReclamo = document.getElementById("btn-abrir-form-reclamo");
const formReclamo = document.getElementById("form-reclamo");
const tituloFormReclamo = document.getElementById("titulo-form-reclamo");
const inputDuenioReclamo = document.getElementById("input-duenio-reclamo");
const inputParticularidadesReclamo = document.getElementById("input-particularidades-reclamo");
const inputContactoReclamo = document.getElementById("input-contacto-reclamo");
const errorReclamo = document.getElementById("error-reclamo");
const btnCancelarReclamo = document.getElementById("btn-cancelar-reclamo");
const btnSubmitReclamo = document.getElementById("btn-submit-reclamo");

const seccionGestionAdmin = document.getElementById("seccion-gestion-admin");
const adminTextoParticularidadSecreta = document.getElementById("admin-texto-particularidad-secreta");
const btnAdminEditarSecreto = document.getElementById("btn-admin-editar-secreto");
const contadorReclamosDetalle = document.getElementById("contador-reclamos-detalle");
const listaReclamosAdmin = document.getElementById("lista-reclamos-admin");
const detailsEntregaManual = document.getElementById("details-entrega-manual");
const formEntregaManual = document.getElementById("form-entrega-manual");
const adminInputDestinatario = document.getElementById("admin-input-destinatario");
const adminInputParticularidades = document.getElementById("admin-input-particularidades");
const btnRevertirPendiente = document.getElementById("btn-revertir-pendiente");
const btnEliminarPublicacion = document.getElementById("btn-eliminar-publicacion");

// Modal Panel Admin (Categorías, Lugares, Usuarios y EmailJS)
const modalAdmin = document.getElementById("modal-admin");
const btnCerrarAdmin = document.getElementById("btn-cerrar-admin");
const btnCerrarAdminFooter = document.getElementById("btn-cerrar-admin-footer");
const formAgregarCategoria = document.getElementById("form-agregar-categoria");
const inputNuevaCatIcono = document.getElementById("input-nueva-cat-icono");
const inputNuevaCatNombre = document.getElementById("input-nueva-cat-nombre");
const listaAdminCategorias = document.getElementById("lista-admin-categorias");

const formAgregarLugar = document.getElementById("form-agregar-lugar");
const inputNuevoLugar = document.getElementById("input-nuevo-lugar");
const listaAdminLugares = document.getElementById("lista-admin-lugares");

const formAgregarRetiro = document.getElementById("form-agregar-retiro");
const inputNuevoRetiro = document.getElementById("input-nuevo-retiro");
const listaAdminRetiros = document.getElementById("lista-admin-retiros");

const formConfigEmail = document.getElementById("form-config-email");
const inputEmailjsService = document.getElementById("input-emailjs-service");
const inputEmailjsTemplate = document.getElementById("input-emailjs-template");
const inputEmailjsPubkey = document.getElementById("input-emailjs-pubkey");

const contadorAdminUsuarios = document.getElementById("contador-admin-usuarios");
const listaAdminUsuarios = document.getElementById("lista-admin-usuarios");

// Toast
const notificacionToast = document.getElementById("notificacion-toast");
const textoToast = document.getElementById("texto-toast");
let toastTimeoutId = null;

/* ==========================================================================
   PERSISTENCIA EN LOCALSTORAGE
   ========================================================================== */
function cargarDatos() {
  try {
    const catGuardadas = localStorage.getItem(STORAGE_KEYS.CATEGORIAS);
    categoriasSistema = catGuardadas ? JSON.parse(catGuardadas) : [...CATEGORIAS_INICIALES];

    const lugGuardados = localStorage.getItem(STORAGE_KEYS.LUGARES);
    lugaresSistema = lugGuardados ? JSON.parse(lugGuardados) : [...LUGARES_INICIALES];

    const retGuardados = localStorage.getItem(STORAGE_KEYS.RETIROS);
    retirosSistema = retGuardados ? JSON.parse(retGuardados) : [...RETIROS_INICIALES];

    const emailGuardado = localStorage.getItem(STORAGE_KEYS.EMAILJS);
    if (emailGuardado) {
      const parseado = JSON.parse(emailGuardado);
      configEmailJS = {
        serviceId: parseado.serviceId || EMAILJS_POR_DEFECTO.serviceId,
        templateId: parseado.templateId || EMAILJS_POR_DEFECTO.templateId,
        publicKey: parseado.publicKey || EMAILJS_POR_DEFECTO.publicKey
      };
    } else {
      configEmailJS = { ...EMAILJS_POR_DEFECTO };
    }

    const usrGuardados = localStorage.getItem(STORAGE_KEYS.USUARIOS);
    listaUsuarios = usrGuardados ? JSON.parse(usrGuardados) : [...USUARIOS_INICIALES];

    const sesionGuardada = localStorage.getItem(STORAGE_KEYS.SESION);
    if (sesionGuardada) {
      const correoSesion = JSON.parse(sesionGuardada);
      usuarioActual =
        listaUsuarios.find((u) => u.correo === correoSesion && u.verificado) || null;
    }

    const objGuardados = localStorage.getItem(STORAGE_KEYS.OBJETOS);
    if (objGuardados) {
      listaObjetos = JSON.parse(objGuardados);
    } else {
      listaObjetos = crearObjetosIniciales();
      guardarTodo();
    }
  } catch (error) {
    console.error("Error al inicializar datos:", error);
    categoriasSistema = [...CATEGORIAS_INICIALES];
    lugaresSistema = [...LUGARES_INICIALES];
    retirosSistema = [...RETIROS_INICIALES];
    configEmailJS = { ...EMAILJS_POR_DEFECTO };
    listaUsuarios = [...USUARIOS_INICIALES];
    listaObjetos = crearObjetosIniciales();
  }
}

function guardarTodo() {
  try {
    localStorage.setItem(STORAGE_KEYS.CATEGORIAS, JSON.stringify(categoriasSistema));
    localStorage.setItem(STORAGE_KEYS.LUGARES, JSON.stringify(lugaresSistema));
    localStorage.setItem(STORAGE_KEYS.RETIROS, JSON.stringify(retirosSistema));
    localStorage.setItem(STORAGE_KEYS.EMAILJS, JSON.stringify(configEmailJS));
    localStorage.setItem(STORAGE_KEYS.USUARIOS, JSON.stringify(listaUsuarios));
    localStorage.setItem(STORAGE_KEYS.OBJETOS, JSON.stringify(listaObjetos));
    if (usuarioActual) {
      localStorage.setItem(STORAGE_KEYS.SESION, JSON.stringify(usuarioActual.correo));
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESION);
    }
  } catch (error) {
    console.error("Error al guardar en localStorage:", error);
    mostrarToast("⚠️ Memoria llena en el navegador.");
  }
}

function restaurarDatosDemo() {
  if (!esAdminActual()) {
    mostrarToast("⛔ Acceso denegado: Solo el Administrador puede restaurar los datos del sistema.");
    return;
  }

  const confirmar = window.confirm(
    "¿Confirmás como Administrador restaurar los objetos, categorías y lugares originales de demostración?"
  );
  if (!confirmar) return;

  categoriasSistema = [...CATEGORIAS_INICIALES];
  lugaresSistema = [...LUGARES_INICIALES];
  retirosSistema = [...RETIROS_INICIALES];
  listaObjetos = crearObjetosIniciales();

  guardarTodo();
  renderizarCatalogosDinamicos();
  renderizarListasAdminConfig();
  restablecerTodosLosFiltros();
  modalAdmin.close();
  mostrarToast("🔄 Datos iniciales de demostración restaurados por el Administrador.");
}

/* ==========================================================================
   UTILIDADES GENERALES, AUTORÍA Y COMPRESIÓN DE FOTOS
   ========================================================================== */
function formatearFechaLegible(fechaISO) {
  if (!fechaISO) return "Sin fecha";
  const partes = fechaISO.split("-");
  if (partes.length !== 3) return fechaISO;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obtenerFechaHoyISO() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function mostrarToast(mensaje) {
  textoToast.textContent = mensaje;
  notificacionToast.hidden = false;

  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = setTimeout(() => {
    notificacionToast.hidden = true;
  }, 4200);
}

function generarCodigoSeisDigitos() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Determina si un objeto fue publicado por el usuario indicado.
 */
function esAutorDePublicacion(obj, usuario) {
  if (!obj || !usuario) return false;
  if (obj.publicadoPorCorreo) {
    return obj.publicadoPorCorreo.toLowerCase() === usuario.correo.toLowerCase();
  }
  const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`.trim().toLowerCase();
  return Boolean(
    obj.publicadoPor && obj.publicadoPor.toLowerCase().startsWith(nombreCompleto)
  );
}

/**
 * Determina si el usuario indicado tiene un reclamo enviado en este objeto.
 */
function tieneReclamoDeUsuario(obj, usuario) {
  if (!obj || !usuario || !Array.isArray(obj.reclamos)) return false;
  return obj.reclamos.some(
    (r) => r.usuarioCorreo && r.usuarioCorreo.toLowerCase() === usuario.correo.toLowerCase()
  );
}

/**
 * Devuelve únicamente los reclamos activos (no rechazados) para las métricas de verificación.
 */
function obtenerReclamosActivos(obj) {
  if (!obj || !Array.isArray(obj.reclamos)) return [];
  return obj.reclamos.filter((r) => r.estadoReclamo !== "rechazado");
}

function comprimirImagen(archivo, maxAncho = 800, calidad = 0.8) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = (eventoLectura) => {
      const img = new Image();
      img.onload = () => {
        let ancho = img.width;
        let alto = img.height;

        if (ancho > maxAncho) {
          alto = Math.round((alto * maxAncho) / ancho);
          ancho = maxAncho;
        }

        const canvas = document.createElement("canvas");
        canvas.width = ancho;
        canvas.height = alto;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, ancho, alto);

        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.onerror = () => reject(new Error("No se pudo procesar la imagen."));
      img.src = eventoLectura.target.result;
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/* ==========================================================================
   ENVÍO REAL DE CORREO ELECTRÓNICO CON CÓDIGO DE VERIFICACIÓN (EmailJS API)
   ========================================================================== */
async function enviarCorreoVerificacionReal(usuario) {
  console.info(
    `[UNSE Auth] Código enviado a ${usuario.correo}: ${usuario.codigoVerificacion}`
  );

  const { serviceId, templateId, publicKey } = configEmailJS;

  if (!serviceId || !templateId || !publicKey) {
    return {
      enviadoReal: false,
      motivo:
        "Para que el correo llegue a Gmail/UNSE, configurá el Service ID, Template ID y Public Key de EmailJS en el botón '⚙️ Configurar Sistema' (del Admin)."
    };
  }

  try {
    const respuesta = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: publicKey,
        template_params: {
          to_email: usuario.correo,
          email: usuario.correo,
          to_name: `${usuario.nombre} ${usuario.apellido}`,
          name: "Tablero de Objetos Perdidos UNSE",
          codigo: usuario.codigoVerificacion,
          facultad: usuario.facultad,
          carrera: usuario.carrera,
          message: `Tu código de verificación de 6 dígitos para el Tablero Digital de Objetos Perdidos de la UNSE es: ${usuario.codigoVerificacion}`
        }
      })
    });

    if (!respuesta.ok) {
      const detalleError = await respuesta.text();
      throw new Error(detalleError || "Error en servidor de correo");
    }

    return { enviadoReal: true };
  } catch (error) {
    console.error("Error al enviar correo mediante EmailJS:", error);
    return {
      enviadoReal: false,
      motivo:
        "No se pudo conectar con el servidor de EmailJS. Verificá las credenciales o tu conexión a internet."
    };
  }
}

/* ==========================================================================
   AUTENTICACIÓN, REGISTRO UNSE Y VERIFICACIÓN POR CÓDIGO DE 6 DÍGITOS
   ========================================================================== */
function esAdminActual() {
  return Boolean(usuarioActual && usuarioActual.rol === "admin");
}

function actualizarInterfazSesion() {
  if (!usuarioActual) {
    vistaNoAutenticado.hidden = false;
    vistaAutenticado.hidden = true;
    btnAbrirAdmin.hidden = true;
    barraActividadUsuario.hidden = true;
    if (filtrosActivos.filtroPersonal !== "todos") {
      filtrosActivos.filtroPersonal = "todos";
    }
    return;
  }

  vistaNoAutenticado.hidden = true;
  vistaAutenticado.hidden = false;
  barraActividadUsuario.hidden = false;

  nombreUsuarioActivo.textContent = `${usuarioActual.nombre} ${usuarioActual.apellido}`;
  facultadUsuarioActivo.textContent = `· ${usuarioActual.facultad}`;

  if (esAdminActual()) {
    badgeRolUsuario.textContent = "🛡️ Admin";
    badgeRolUsuario.className = "role-badge role-admin";
    btnAbrirAdmin.hidden = false;
  } else {
    badgeRolUsuario.textContent = "🎓 Usuario Verificado";
    badgeRolUsuario.className = "role-badge";
    btnAbrirAdmin.hidden = true;
  }
}

function restablecerVisibilidadPasswords() {
  const botonesPassword = document.querySelectorAll(".btn-toggle-password");
  botonesPassword.forEach((boton) => {
    const idTarget = boton.getAttribute("data-target");
    const input = idTarget ? document.getElementById(idTarget) : null;
    if (input) {
      input.type = "password";
    }
    boton.textContent = "👁️ Ver";
    boton.setAttribute("aria-pressed", "false");
  });
}

function alternarVisibilidadPassword(boton) {
  const idTarget = boton.getAttribute("data-target");
  const input = idTarget ? document.getElementById(idTarget) : null;
  if (!input) return;

  const mostrar = input.type === "password";
  input.type = mostrar ? "text" : "password";
  boton.textContent = mostrar ? "🙈 Ocultar" : "👁️ Ver";
  boton.setAttribute("aria-pressed", mostrar ? "true" : "false");
  input.focus();
}

function abrirModalAuth(pestania = "login") {
  errorLogin.hidden = true;
  errorRegistro.hidden = true;
  errorVerificacion.hidden = true;
  restablecerVisibilidadPasswords();

  if (pestania === "registro") {
    tabsAuth.hidden = false;
    tabBtnLogin.classList.remove("active");
    tabBtnLogin.setAttribute("aria-selected", "false");
    tabBtnRegistro.classList.add("active");
    tabBtnRegistro.setAttribute("aria-selected", "true");
    formLogin.hidden = true;
    formRegistro.hidden = false;
    vistaVerificacion.hidden = true;
  } else if (pestania === "verificacion") {
    tabsAuth.hidden = true;
    formLogin.hidden = true;
    formRegistro.hidden = true;
    vistaVerificacion.hidden = false;
  } else {
    tabsAuth.hidden = false;
    tabBtnLogin.classList.add("active");
    tabBtnLogin.setAttribute("aria-selected", "true");
    tabBtnRegistro.classList.remove("active");
    tabBtnRegistro.setAttribute("aria-selected", "false");
    formLogin.hidden = false;
    formRegistro.hidden = true;
    vistaVerificacion.hidden = true;
  }

  if (!modalAuth.open) {
    modalAuth.showModal();
  }
}

async function procesarLogin(evento) {
  evento.preventDefault();
  errorLogin.hidden = true;

  const correo = loginCorreo.value.trim().toLowerCase();
  const password = loginPassword.value;

  const usuario = listaUsuarios.find(
    (u) => u.correo.toLowerCase() === correo && u.password === password
  );

  if (!usuario) {
    errorLogin.textContent = "⚠️ Correo o contraseña incorrectos.";
    errorLogin.hidden = false;
    return;
  }

  if (!usuario.verificado) {
    usuarioPendienteVerificacion = usuario;
    usuarioPendienteVerificacion.codigoVerificacion = generarCodigoSeisDigitos();
    guardarTodo();
    await despacharYMostrarVerificacion(usuarioPendienteVerificacion);
    return;
  }

  iniciarSesionConUsuario(usuario);
}

function iniciarSesionConUsuario(usuario) {
  usuarioActual = usuario;
  guardarTodo();
  actualizarInterfazSesion();
  renderizarTablero();
  modalAuth.close();
  mostrarToast(`👋 ¡Bienvenido/a, ${usuario.nombre} ${usuario.apellido}!`);
}

async function procesarRegistroUsuario(evento) {
  evento.preventDefault();
  errorRegistro.hidden = true;

  const nombre = regNombre.value.trim();
  const apellido = regApellido.value.trim();
  const correo = regCorreo.value.trim().toLowerCase();
  const facultad = regFacultad.value;
  const carrera = regCarrera.value.trim();
  const password = regPassword.value;

  if (!nombre || !apellido || !correo || !facultad || !carrera || !password) {
    errorRegistro.textContent = "⚠️ Completá todos los campos obligatorios del registro UNSE.";
    errorRegistro.hidden = false;
    return;
  }

  if (!correo.includes("@") || !correo.includes(".")) {
    errorRegistro.textContent = "⚠️ Ingresá una dirección de correo electrónico válida.";
    errorRegistro.hidden = false;
    return;
  }

  if (password.length < 6) {
    errorRegistro.textContent = "⚠️ La contraseña debe tener al menos 6 caracteres.";
    errorRegistro.hidden = false;
    return;
  }

  const usuarioExistente = listaUsuarios.find((u) => u.correo.toLowerCase() === correo);
  if (usuarioExistente && usuarioExistente.verificado) {
    errorRegistro.textContent = "⚠️ Ya existe una cuenta verificada con ese correo electrónico.";
    errorRegistro.hidden = false;
    return;
  }

  const codigo = generarCodigoSeisDigitos();
  let nuevoUsuario = usuarioExistente;

  if (nuevoUsuario) {
    nuevoUsuario.nombre = nombre;
    nuevoUsuario.apellido = apellido;
    nuevoUsuario.facultad = facultad;
    nuevoUsuario.carrera = carrera;
    nuevoUsuario.password = password;
    nuevoUsuario.codigoVerificacion = codigo;
  } else {
    nuevoUsuario = {
      id: `usr-${Date.now()}`,
      nombre,
      apellido,
      correo,
      password,
      facultad,
      carrera,
      rol: "usuario",
      verificado: false,
      codigoVerificacion: codigo
    };
    listaUsuarios.push(nuevoUsuario);
  }

  usuarioPendienteVerificacion = nuevoUsuario;
  guardarTodo();

  btnSubmitRegistro.disabled = true;
  btnSubmitRegistro.textContent = "⏳ Enviando código a tu correo...";

  await despacharYMostrarVerificacion(nuevoUsuario);

  btnSubmitRegistro.disabled = false;
  btnSubmitRegistro.textContent = "Enviar código de verificación a mi correo";
  formRegistro.reset();
}

async function despacharYMostrarVerificacion(usuario) {
  verifNombreDestinatario.textContent = `${usuario.nombre} ${usuario.apellido}`;
  verifCorreoDestinatario.textContent = usuario.correo;
  inputCodigoVerificacion.value = "";
  errorVerificacion.hidden = true;
  estadoEnvioCorreo.textContent = "⏳ Conectando con el servidor de correo electrónico...";

  abrirModalAuth("verificacion");

  const resultado = await enviarCorreoVerificacionReal(usuario);
  if (resultado.enviadoReal) {
    estadoEnvioCorreo.textContent =
      "✅ ¡Correo enviado con éxito! Revisá tu Bandeja de Entrada (o la carpeta de Spam) e ingresá el código de 6 dígitos.";
  } else {
    estadoEnvioCorreo.textContent = `ℹ️ ${resultado.motivo}`;
  }
}

function procesarVerificacionCodigo(evento) {
  evento.preventDefault();
  errorVerificacion.hidden = true;

  if (!usuarioPendienteVerificacion) return;

  const codigoIngresado = inputCodigoVerificacion.value.trim();
  if (codigoIngresado !== usuarioPendienteVerificacion.codigoVerificacion) {
    errorVerificacion.textContent =
      "⚠️ El código ingresado es incorrecto. Verificá los 6 dígitos en el correo recibido.";
    errorVerificacion.hidden = false;
    return;
  }

  usuarioPendienteVerificacion.verificado = true;
  delete usuarioPendienteVerificacion.codigoVerificacion;
  const usuarioActivado = usuarioPendienteVerificacion;
  usuarioPendienteVerificacion = null;

  iniciarSesionConUsuario(usuarioActivado);
  mostrarToast("✅ ¡Cuenta verificada con éxito! Ya podés publicar y reclamar objetos.");
}

async function reenviarNuevoCodigo() {
  if (!usuarioPendienteVerificacion) return;
  usuarioPendienteVerificacion.codigoVerificacion = generarCodigoSeisDigitos();
  guardarTodo();

  btnReenviarCodigo.disabled = true;
  btnReenviarCodigo.textContent = "⏳ Reenviando...";
  await despacharYMostrarVerificacion(usuarioPendienteVerificacion);
  btnReenviarCodigo.disabled = false;
  btnReenviarCodigo.textContent = "🔄 Reenviar código al correo";

  mostrarToast("📧 Se envió un nuevo código de 6 dígitos a tu correo.");
}

function cerrarSesionActual() {
  usuarioActual = null;
  filtrosActivos.filtroPersonal = "todos";
  guardarTodo();
  actualizarInterfazSesion();
  renderizarTablero();
  mostrarToast("🔒 Cerraste sesión correctamente.");
}

/* ==========================================================================
   RENDERIZADO DINÁMICO DE CATEGORÍAS Y LUGARES (Configurables por Admin)
   ========================================================================== */
function renderizarCatalogosDinamicos() {
  contenedorChipsCategorias.innerHTML = "";

  const btnTodos = document.createElement("button");
  btnTodos.type = "button";
  const todosActivo = filtrosActivos.categoria === "todos";
  btnTodos.className = `category-chip ${todosActivo ? "active" : ""}`;
  btnTodos.dataset.categoria = "todos";
  btnTodos.setAttribute("aria-pressed", todosActivo ? "true" : "false");
  btnTodos.textContent = "Todos";
  btnTodos.addEventListener("click", () => seleccionarFiltroCategoria("todos"));
  contenedorChipsCategorias.appendChild(btnTodos);

  categoriasSistema.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const activo = filtrosActivos.categoria === cat.nombre;
    btn.className = `category-chip ${activo ? "active" : ""}`;
    btn.dataset.categoria = cat.nombre;
    btn.setAttribute("aria-pressed", activo ? "true" : "false");
    btn.textContent = `${cat.icono} ${cat.nombre}`;
    btn.addEventListener("click", () => seleccionarFiltroCategoria(cat.nombre));
    contenedorChipsCategorias.appendChild(btn);
  });

  contenedorRadiosCategorias.innerHTML = "";
  categoriasSistema.forEach((cat, index) => {
    const label = document.createElement("label");
    label.className = "quick-option";
    label.innerHTML = `
      <input type="radio" name="categoria" value="${escaparHTML(cat.nombre)}" ${index === 0 ? "required" : ""} />
      <span class="quick-option-box">${escaparHTML(cat.icono)} ${escaparHTML(cat.nombre)}</span>
    `;
    contenedorRadiosCategorias.appendChild(label);
  });

  selectLugar.innerHTML = `<option value="todos">Todos los sectores</option>`;
  inputLugarEncontrado.innerHTML = `<option value="" disabled selected>Seleccioná el sector de la facultad...</option>`;
  lugaresSistema.forEach((lugar) => {
    const lugarSeguro = escaparHTML(lugar);
    selectLugar.innerHTML += `<option value="${lugarSeguro}">${lugarSeguro}</option>`;
    inputLugarEncontrado.innerHTML += `<option value="${lugarSeguro}">${lugarSeguro}</option>`;
  });
  selectLugar.value = lugaresSistema.includes(filtrosActivos.lugar) ? filtrosActivos.lugar : "todos";

  selectRetiro.innerHTML = `<option value="todos">Todos los puntos de retiro</option>`;
  inputLugarRetiro.innerHTML = "";
  retirosSistema.forEach((retiro, idx) => {
    const retiroSeguro = escaparHTML(retiro);
    selectRetiro.innerHTML += `<option value="${retiroSeguro}">${retiroSeguro}</option>`;
    inputLugarRetiro.innerHTML += `<option value="${retiroSeguro}" ${idx === 0 ? "selected" : ""}>🏢 ${retiroSeguro}</option>`;
  });
  selectRetiro.value = retirosSistema.includes(filtrosActivos.retiro) ? filtrosActivos.retiro : "todos";
}

function seleccionarFiltroCategoria(nombreCategoria) {
  filtrosActivos.categoria = nombreCategoria;
  renderizarCatalogosDinamicos();
  renderizarTablero();
}

function seleccionarFiltroPersonal(tipoFiltro) {
  if (filtrosActivos.filtroPersonal === tipoFiltro) {
    filtrosActivos.filtroPersonal = "todos";
  } else {
    filtrosActivos.filtroPersonal = tipoFiltro;
  }
  renderizarTablero();
}

/* ==========================================================================
   PANEL DE CONFIGURACIÓN DEL ADMINISTRADOR (Categorías, Lugares, Usuarios, EmailJS)
   ========================================================================== */
function abrirModalAdminConfig() {
  if (!esAdminActual()) {
    mostrarToast("⛔ Acceso restringido únicamente al Administrador.");
    return;
  }
  inputEmailjsService.value = configEmailJS.serviceId || "";
  inputEmailjsTemplate.value = configEmailJS.templateId || "";
  inputEmailjsPubkey.value = configEmailJS.publicKey || "";

  renderizarListasAdminConfig();
  modalAdmin.showModal();
}

function renderizarListasAdminConfig() {
  // 1. Categorías
  listaAdminCategorias.innerHTML = "";
  categoriasSistema.forEach((cat) => {
    const item = document.createElement("span");
    item.className = "admin-tag-item";
    item.innerHTML = `
      <span>${escaparHTML(cat.icono)} ${escaparHTML(cat.nombre)}</span>
      <button type="button" class="btn-remove-tag" aria-label="Eliminar categoría ${escaparHTML(cat.nombre)}">✕</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      if (categoriasSistema.length <= 1) {
        mostrarToast("⚠️ Debe existir al menos una categoría en el sistema.");
        return;
      }
      categoriasSistema = categoriasSistema.filter((c) => c.nombre !== cat.nombre);
      guardarTodo();
      renderizarCatalogosDinamicos();
      renderizarListasAdminConfig();
      renderizarTablero();
      mostrarToast(`🗑️ Categoría "${cat.nombre}" eliminada.`);
    });
    listaAdminCategorias.appendChild(item);
  });

  // 2. Lugares de hallazgo
  listaAdminLugares.innerHTML = "";
  lugaresSistema.forEach((lugar) => {
    const item = document.createElement("span");
    item.className = "admin-tag-item";
    item.innerHTML = `
      <span>📍 ${escaparHTML(lugar)}</span>
      <button type="button" class="btn-remove-tag" aria-label="Eliminar sector ${escaparHTML(lugar)}">✕</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      if (lugaresSistema.length <= 1) {
        mostrarToast("⚠️ Debe existir al menos un sector en el sistema.");
        return;
      }
      lugaresSistema = lugaresSistema.filter((l) => l !== lugar);
      guardarTodo();
      renderizarCatalogosDinamicos();
      renderizarListasAdminConfig();
      mostrarToast(`🗑️ Sector "${lugar}" eliminado.`);
    });
    listaAdminLugares.appendChild(item);
  });

  // 3. Puntos de retiro
  listaAdminRetiros.innerHTML = "";
  retirosSistema.forEach((retiro) => {
    const item = document.createElement("span");
    item.className = "admin-tag-item";
    item.innerHTML = `
      <span>🏢 ${escaparHTML(retiro)}</span>
      <button type="button" class="btn-remove-tag" aria-label="Eliminar punto de retiro ${escaparHTML(retiro)}">✕</button>
    `;
    item.querySelector("button").addEventListener("click", () => {
      if (retirosSistema.length <= 1) {
        mostrarToast("⚠️ Debe existir al menos un punto de retiro.");
        return;
      }
      retirosSistema = retirosSistema.filter((r) => r !== retiro);
      guardarTodo();
      renderizarCatalogosDinamicos();
      renderizarListasAdminConfig();
      mostrarToast(`🗑️ Punto de retiro "${retiro}" eliminado.`);
    });
    listaAdminRetiros.appendChild(item);
  });

  // 4. Lista de Usuarios registrados
  contadorAdminUsuarios.textContent = listaUsuarios.length;
  listaAdminUsuarios.innerHTML = "";
  listaUsuarios.forEach((u) => {
    const fila = document.createElement("div");
    fila.className = "admin-user-row";
    const badgeVerif = u.verificado ? "✅ Verificado" : "⏳ Pendiente de código";
    const etiquetaRol = u.rol === "admin" ? "🛡️ Admin" : "🎓 Usuario";
    fila.innerHTML = `
      <div>
        <strong>${etiquetaRol} · ${escaparHTML(u.nombre)} ${escaparHTML(u.apellido)}</strong>
        <span class="form-hint">(${escaparHTML(u.correo)}) — ${badgeVerif}</span>
      </div>
      <div class="form-hint">
        ${escaparHTML(u.facultad)} · ${escaparHTML(u.carrera)}
      </div>
    `;
    listaAdminUsuarios.appendChild(fila);
  });
}

function agregarCategoriaAdmin(evento) {
  evento.preventDefault();
  if (!esAdminActual()) return;

  const nombre = inputNuevaCatNombre.value.trim();
  const icono = inputNuevaCatIcono.value.trim() || "📦";
  if (!nombre) return;

  if (categoriasSistema.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
    mostrarToast("⚠️ Esa categoría ya existe.");
    return;
  }

  categoriasSistema.push({
    nombre,
    icono,
    fondo: "#e0f2fe",
    borde: "#0284c7"
  });

  inputNuevaCatNombre.value = "";
  inputNuevaCatIcono.value = "";
  guardarTodo();
  renderizarCatalogosDinamicos();
  renderizarListasAdminConfig();
  mostrarToast(`✅ Categoría "${icono} ${nombre}" agregada por el Administrador.`);
}

function agregarLugarAdmin(evento) {
  evento.preventDefault();
  if (!esAdminActual()) return;

  const nuevoLugar = inputNuevoLugar.value.trim();
  if (!nuevoLugar) return;

  if (lugaresSistema.some((l) => l.toLowerCase() === nuevoLugar.toLowerCase())) {
    mostrarToast("⚠️ Ese sector ya existe en la lista.");
    return;
  }

  lugaresSistema.push(nuevoLugar);
  inputNuevoLugar.value = "";
  guardarTodo();
  renderizarCatalogosDinamicos();
  renderizarListasAdminConfig();
  mostrarToast(`✅ Sector "${nuevoLugar}" agregado al sistema.`);
}

function agregarRetiroAdmin(evento) {
  evento.preventDefault();
  if (!esAdminActual()) return;

  const nuevoRetiro = inputNuevoRetiro.value.trim();
  if (!nuevoRetiro) return;

  if (retirosSistema.some((r) => r.toLowerCase() === nuevoRetiro.toLowerCase())) {
    mostrarToast("⚠️ Ese punto de retiro ya existe.");
    return;
  }

  retirosSistema.push(nuevoRetiro);
  inputNuevoRetiro.value = "";
  guardarTodo();
  renderizarCatalogosDinamicos();
  renderizarListasAdminConfig();
  mostrarToast(`✅ Punto de retiro "${nuevoRetiro}" agregado.`);
}

function guardarConfiguracionEmailAdmin(evento) {
  evento.preventDefault();
  if (!esAdminActual()) return;

  configEmailJS = {
    serviceId: inputEmailjsService.value.trim(),
    templateId: inputEmailjsTemplate.value.trim(),
    publicKey: inputEmailjsPubkey.value.trim()
  };

  guardarTodo();
  mostrarToast("✅ Configuración de correo electrónico EmailJS guardada.");
}

/* ==========================================================================
   MÉTRICAS Y RENDERIZADO DEL TABLERO PRINCIPAL
   ========================================================================== */
function actualizarEstadisticas() {
  const totalPendientes = listaObjetos.filter((o) => o.estado === "encontrado").length;
  const totalConReclamo = listaObjetos.filter(
    (o) => o.estado === "encontrado" && obtenerReclamosActivos(o).length > 0
  ).length;
  const totalRecuperados = listaObjetos.filter((o) => o.estado === "recuperado").length;

  numPendientes.textContent = totalPendientes;
  numReclamos.textContent = totalConReclamo;
  numRecuperados.textContent = totalRecuperados;

  if (usuarioActual) {
    barraActividadUsuario.hidden = false;
    const cantMisPub = listaObjetos.filter((o) => esAutorDePublicacion(o, usuarioActual)).length;
    const cantMisRec = listaObjetos.filter((o) => tieneReclamoDeUsuario(o, usuarioActual)).length;

    numMisPublicaciones.textContent = cantMisPub;
    numMisReclamos.textContent = cantMisRec;

    const pubActivo = filtrosActivos.filtroPersonal === "mis_publicaciones";
    const recActivo = filtrosActivos.filtroPersonal === "mis_reclamos";

    btnFiltroMisPublicaciones.classList.toggle("active", pubActivo);
    btnFiltroMisPublicaciones.setAttribute("aria-pressed", pubActivo ? "true" : "false");

    btnFiltroMisReclamos.classList.toggle("active", recActivo);
    btnFiltroMisReclamos.setAttribute("aria-pressed", recActivo ? "true" : "false");

    btnQuitarFiltroPersonal.hidden = filtrosActivos.filtroPersonal === "todos";
  } else {
    barraActividadUsuario.hidden = true;
  }
}

function obtenerObjetosFiltrados() {
  const termino = filtrosActivos.busqueda.trim().toLowerCase();

  return listaObjetos.filter((obj) => {
    const coincideTexto =
      termino === "" ||
      obj.titulo.toLowerCase().includes(termino) ||
      obj.descripcion.toLowerCase().includes(termino) ||
      obj.lugarEncontrado.toLowerCase().includes(termino) ||
      obj.lugarRetiro.toLowerCase().includes(termino) ||
      obj.categoria.toLowerCase().includes(termino);

    const coincideCategoria =
      filtrosActivos.categoria === "todos" || obj.categoria === filtrosActivos.categoria;

    const coincideLugar =
      filtrosActivos.lugar === "todos" || obj.lugarEncontrado === filtrosActivos.lugar;

    const coincideRetiro =
      filtrosActivos.retiro === "todos" || obj.lugarRetiro === filtrosActivos.retiro;

    let coincideEstado = true;
    if (filtrosActivos.estado === "encontrado") {
      coincideEstado = obj.estado === "encontrado";
    } else if (filtrosActivos.estado === "con_reclamo") {
      coincideEstado =
        obj.estado === "encontrado" && obtenerReclamosActivos(obj).length > 0;
    } else if (filtrosActivos.estado === "recuperado") {
      coincideEstado = obj.estado === "recuperado";
    }

    const coincideFecha =
      filtrosActivos.fechaDesde === "" || obj.fecha >= filtrosActivos.fechaDesde;

    let coincidePersonal = true;
    if (usuarioActual && filtrosActivos.filtroPersonal === "mis_publicaciones") {
      coincidePersonal = esAutorDePublicacion(obj, usuarioActual);
    } else if (usuarioActual && filtrosActivos.filtroPersonal === "mis_reclamos") {
      coincidePersonal = tieneReclamoDeUsuario(obj, usuarioActual);
    }

    return (
      coincideTexto &&
      coincideCategoria &&
      coincideLugar &&
      coincideRetiro &&
      coincideEstado &&
      coincideFecha &&
      coincidePersonal
    );
  });
}

function renderizarTablero() {
  actualizarEstadisticas();

  const filtrados = obtenerObjetosFiltrados();
  const tarjetasPrevias = grillaObjetos.querySelectorAll(".object-card");
  tarjetasPrevias.forEach((t) => t.remove());

  if (filtrados.length === 0) {
    contadorResultados.textContent = "No se encontraron objetos que coincidan con la búsqueda.";
    estadoVacio.hidden = false;
    return;
  }

  estadoVacio.hidden = true;
  let prefijoFiltro = "";
  if (filtrosActivos.filtroPersonal === "mis_publicaciones") {
    prefijoFiltro = " (Filtrado por: 📢 Mis publicaciones)";
  } else if (filtrosActivos.filtroPersonal === "mis_reclamos") {
    prefijoFiltro = " (Filtrado por: 🙋‍♂️ Mis reclamos enviados)";
  }

  contadorResultados.textContent =
    (filtrados.length === 1
      ? "Mostrando 1 objeto publicado"
      : `Mostrando ${filtrados.length} objetos publicados`) + prefijoFiltro;

  filtrados.forEach((obj) => {
    const articulo = document.createElement("article");
    articulo.className = "object-card";

    const cantReclamosActivos = obtenerReclamosActivos(obj).length;
    const miReclamoEnTarjeta = usuarioActual && Array.isArray(obj.reclamos)
      ? obj.reclamos.find(
          (r) => r.usuarioCorreo && r.usuarioCorreo.toLowerCase() === usuarioActual.correo.toLowerCase()
        )
      : null;

    let claseEstado = "status-encontrado";
    let textoEstado = "⏳ Pendiente de retiro";

    if (obj.estado === "recuperado") {
      claseEstado = "status-recuperado";
      textoEstado =
        miReclamoEnTarjeta && miReclamoEnTarjeta.estadoReclamo === "aprobado"
          ? "🎉 ¡Entregado a vos!"
          : "✅ Entregado a su dueño";
    } else if (miReclamoEnTarjeta && miReclamoEnTarjeta.estadoReclamo === "rechazado") {
      claseEstado = "status-encontrado";
      textoEstado = "❌ Tu reclamo fue rechazado";
    } else if (cantReclamosActivos > 0) {
      claseEstado = "status-reclamo";
      textoEstado = `🙋‍♂️ ${cantReclamosActivos} reclamo(s) a verificar`;
    }

    const textoAlt = escaparHTML(
      obj.altText ||
        `Fotografía de ${obj.titulo}, categoría ${obj.categoria}, encontrado en ${obj.lugarEncontrado}`
    );

    const tituloSeguro = escaparHTML(obj.titulo);
    const categoriaSegura = escaparHTML(obj.categoria);
    const lugarEncontradoSeguro = escaparHTML(obj.lugarEncontrado);
    const lugarRetiroSeguro = escaparHTML(obj.lugarRetiro);

    articulo.innerHTML = `
      <div class="card-image-container">
        <img
          src="${obj.imagen}"
          alt="${textoAlt}"
          class="card-image"
          loading="lazy"
        />
        <div class="card-badges">
          <span class="badge">${categoriaSegura}</span>
          <span class="status-badge ${claseEstado}">${textoEstado}</span>
        </div>
      </div>

      <div class="card-body">
        <h2 class="card-title">${tituloSeguro}</h2>
        <div class="card-meta">
          <span>📍 <strong>Encontrado en:</strong> ${lugarEncontradoSeguro}</span>
          <span>📅 <strong>Fecha:</strong> ${formatearFechaLegible(obj.fecha)}</span>
        </div>
        <div class="card-pickup-box">
          🏢 Resguardado en: ${lugarRetiroSeguro}
        </div>
      </div>

      <div class="card-footer">
        <button
          type="button"
          class="btn btn-outline btn-card-detail"
          data-id="${escaparHTML(obj.id)}"
          aria-label="Ver detalles o reclamar ${tituloSeguro}"
        >
          Ver detalle / Reclamar objeto
        </button>
      </div>
    `;

    articulo.querySelector(".btn-card-detail").addEventListener("click", () => {
      abrirModalDetalle(obj.id);
    });

    grillaObjetos.appendChild(articulo);
  });
}

/* ==========================================================================
   MODAL DE DETALLE, RECLAMO CON PARTICULARIDADES Y ENTREGA VERIFICADA
   ========================================================================== */
function abrirModalDetalle(id) {
  const obj = listaObjetos.find((item) => item.id === id);
  if (!obj) return;

  objetoSeleccionadoId = id;
  reclamoPreseleccionadoId = null;
  if (!Array.isArray(obj.reclamos)) obj.reclamos = [];

  detalleCategoriaBadge.textContent = obj.categoria;

  const esRecuperado = obj.estado === "recuperado";
  const cantActivos = obtenerReclamosActivos(obj).length;

  if (esRecuperado) {
    detalleEstadoBadge.className = "status-badge status-recuperado";
    detalleEstadoBadge.textContent = "✅ Entregado a la persona indicada";
  } else if (cantActivos > 0) {
    detalleEstadoBadge.className = "status-badge status-reclamo";
    detalleEstadoBadge.textContent = `🙋‍♂️ ${cantActivos} reclamo(s) en verificación`;
  } else {
    detalleEstadoBadge.className = "status-badge status-encontrado";
    detalleEstadoBadge.textContent = "⏳ Pendiente de retiro";
  }

  detalleImagen.src = obj.imagen;
  detalleImagen.alt =
    obj.altText || `Fotografía de ${obj.titulo} encontrado en ${obj.lugarEncontrado}`;
  if (contenedorDetalleImagen) {
    contenedorDetalleImagen.classList.remove("is-zoomed");
  }
  if (btnZoomImagen) {
    btnZoomImagen.textContent = "🔍 Ampliar foto";
  }

  detalleTitulo.textContent = obj.titulo;
  detalleDescripcion.textContent =
    obj.descripcion || "Sin observaciones adicionales especificadas.";
  detalleLugarEncontrado.textContent = obj.lugarEncontrado;
  detalleFecha.textContent = formatearFechaLegible(obj.fecha);
  detalleLugarRetiro.textContent = obj.lugarRetiro;
  detallePublicadoPor.textContent = obj.publicadoPor || "Integrante de la comunidad UNSE";

  const esElAutor = Boolean(usuarioActual && esAutorDePublicacion(obj, usuarioActual));

  // Mostrar opción de editar si el usuario actual es quien publicó el objeto (y aún no fue entregado)
  if (!esRecuperado && esElAutor) {
    cajaAutorPublicacion.hidden = false;
    autorParticularidadSecretaTexto.textContent = obj.particularidadesHallazgo
      ? `🔒 Particularidad privada que registraste para el Admin: "${obj.particularidadesHallazgo}"`
      : "🔒 Aún no especificaste una particularidad privada para el Admin (podés agregarla tocando Editar).";
  } else {
    cajaAutorPublicacion.hidden = true;
  }

  if (esRecuperado && obj.datosEntrega) {
    cajaDatosEntrega.hidden = false;
    textoEntregadoA.innerHTML = `<strong>Entregado a:</strong> ${escaparHTML(obj.datosEntrega.destinatario)}`;
    textoParticularidadesVerificadas.innerHTML = `<strong>Particularidades comprobadas:</strong> ${escaparHTML(obj.datosEntrega.particularidadesVerificadas)}`;
    textoFechaEntrega.textContent = `Fecha de devolución: ${obj.datosEntrega.fechaEntrega}`;
  } else {
    cajaDatosEntrega.hidden = true;
  }

  // Gestión de la sección de reclamo para quien perdió el objeto
  formReclamo.reset();
  formReclamo.hidden = true;
  errorReclamo.hidden = true;
  btnAbrirFormReclamo.hidden = false;
  tituloFormReclamo.textContent = "Demostrar propiedad del objeto perdido";
  btnSubmitReclamo.textContent = "Enviar solicitud a verificar";

  const reclamoPropio = usuarioActual
    ? obj.reclamos.find(
        (r) => r.usuarioCorreo && r.usuarioCorreo.toLowerCase() === usuarioActual.correo.toLowerCase()
      )
    : null;

  const tituloMiReclamo = miReclamoEnviadoBox.querySelector(".my-claim-title");
  const pieMiReclamo = miReclamoEnviadoBox.querySelector(".my-claim-footer");

  if (reclamoPropio) {
    seccionReclamoUsuario.hidden = false;
    miReclamoEnviadoBox.hidden = false;
    bannerIniciarReclamo.hidden = true;

    const duenioTexto = reclamoPropio.duenioDeclarado || reclamoPropio.usuarioNombre;
    miReclamoDetalleTexto.innerHTML = `
      <strong>Dueño indicado:</strong> ${escaparHTML(duenioTexto)}<br/>
      <strong>Particularidades declaradas (${escaparHTML(reclamoPropio.fechaReclamo)}):</strong> "${escaparHTML(reclamoPropio.particularidades)}"
    `;

    const estadoActualReclamo =
      reclamoPropio.estadoReclamo || (esRecuperado ? "aprobado" : "pendiente");

    if (estadoActualReclamo === "rechazado") {
      miReclamoEnviadoBox.className = "my-claim-status-box claim-rejected";
      if (tituloMiReclamo) {
        tituloMiReclamo.textContent = "❌ Tu solicitud fue rechazada por Administración";
      }
      if (pieMiReclamo) {
        pieMiReclamo.innerHTML =
          "⚠️ <strong>Estado:</strong> Las particularidades que indicaste no coincidieron con los datos privados del objeto. Si creés que omitiste algún detalle importante, podés corregir tu solicitud y volver a enviarla a revisión.";
      }
      btnEditarMiReclamo.hidden = esRecuperado;
      btnEditarMiReclamo.textContent = "✏️ Corregir mis particularidades y reenviar";
    } else if (estadoActualReclamo === "aprobado") {
      miReclamoEnviadoBox.className = "my-claim-status-box claim-approved";
      if (tituloMiReclamo) {
        tituloMiReclamo.textContent = "🎉 ¡Tu solicitud de devolución fue APROBADA!";
      }
      if (pieMiReclamo) {
        pieMiReclamo.innerHTML =
          "✅ <strong>Estado:</strong> El Administrador comprobó que tus particularidades coinciden con el objeto real y registró la devolución.";
      }
      btnEditarMiReclamo.hidden = true;
    } else {
      miReclamoEnviadoBox.className = "my-claim-status-box";
      if (tituloMiReclamo) {
        tituloMiReclamo.textContent = "📩 Ya enviaste una solicitud de devolución por este objeto";
      }
      if (pieMiReclamo) {
        pieMiReclamo.innerHTML =
          "⏳ <strong>Estado:</strong> Pendiente de verificación por el Administrador / Conserjería. Se comprobará si las particularidades que indicaste coinciden con las registradas al encontrar el objeto.";
      }
      btnEditarMiReclamo.hidden = esRecuperado;
      btnEditarMiReclamo.textContent = "✏️ Modificar mis particularidades o teléfono";
    }
  } else if (esRecuperado || esElAutor) {
    // Si ya fue entregado a otra persona o si el usuario actual es quien lo encontró, no muestra formulario de reclamo
    seccionReclamoUsuario.hidden = true;
  } else {
    seccionReclamoUsuario.hidden = false;
    miReclamoEnviadoBox.hidden = true;
    bannerIniciarReclamo.hidden = false;
  }

  // Panel exclusivo del Administrador
  if (esAdminActual()) {
    seccionGestionAdmin.hidden = false;
    adminTextoParticularidadSecreta.textContent =
      obj.particularidadesHallazgo ||
      "Sin particularidad privada registrada al momento de publicar (podés agregarla con '✏️ Editar dato u objeto').";
    btnRevertirPendiente.hidden = !esRecuperado;
    detailsEntregaManual.hidden = esRecuperado;
    detailsEntregaManual.open = false;
    renderizarReclamosParaAdmin(obj);
  } else {
    seccionGestionAdmin.hidden = true;
  }

  modalDetalle.showModal();
}

function alternarZoomImagenDetalle() {
  if (!contenedorDetalleImagen) return;
  const ampliado = contenedorDetalleImagen.classList.toggle("is-zoomed");
  if (btnZoomImagen) {
    btnZoomImagen.textContent = ampliado ? "🔍 Reducir foto" : "🔍 Ampliar foto";
  }
}

function intentarAbrirFormularioReclamo() {
  if (!usuarioActual) {
    modalDetalle.close();
    abrirModalAuth("login");
    mostrarToast("🔑 Iniciá sesión o creá tu cuenta UNSE para reclamar un objeto.");
    return;
  }
  tituloFormReclamo.textContent = "Demostrar propiedad del objeto perdido";
  btnSubmitReclamo.textContent = "Enviar solicitud a verificar";
  inputDuenioReclamo.value = `${usuarioActual.nombre} ${usuarioActual.apellido}`;
  btnAbrirFormReclamo.hidden = true;
  formReclamo.hidden = false;
  inputParticularidadesReclamo.focus();
}

function abrirEdicionMiReclamo() {
  if (!usuarioActual || !objetoSeleccionadoId) return;
  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj || !Array.isArray(obj.reclamos)) return;

  const reclamoPropio = obj.reclamos.find(
    (r) => r.usuarioCorreo && r.usuarioCorreo.toLowerCase() === usuarioActual.correo.toLowerCase()
  );
  if (!reclamoPropio) return;

  tituloFormReclamo.textContent =
    reclamoPropio.estadoReclamo === "rechazado"
      ? "Corregir y reenviar mi solicitud de devolución"
      : "Actualizar datos de mi solicitud de devolución";
  btnSubmitReclamo.textContent =
    reclamoPropio.estadoReclamo === "rechazado"
      ? "Reenviar solicitud a verificar"
      : "Guardar cambios en mi solicitud";
  inputDuenioReclamo.value = reclamoPropio.duenioDeclarado || reclamoPropio.usuarioNombre || "";
  inputParticularidadesReclamo.value = reclamoPropio.particularidades || "";
  inputContactoReclamo.value =
    reclamoPropio.contacto && reclamoPropio.contacto !== "No especificado"
      ? reclamoPropio.contacto
      : "";

  miReclamoEnviadoBox.hidden = true;
  formReclamo.hidden = false;
  inputParticularidadesReclamo.focus();
}

function procesarEnvioReclamo(evento) {
  evento.preventDefault();
  errorReclamo.hidden = true;

  if (!usuarioActual) {
    abrirModalAuth("login");
    return;
  }

  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj) return;

  const duenioDeclarado = inputDuenioReclamo.value.trim();
  const particularidades = inputParticularidadesReclamo.value.trim();
  const contacto = inputContactoReclamo.value.trim();

  if (!duenioDeclarado) {
    errorReclamo.textContent = "⚠️ Indicá el nombre y apellido de la persona dueña del objeto.";
    errorReclamo.hidden = false;
    return;
  }

  if (particularidades.length < 6) {
    errorReclamo.textContent =
      "⚠️ Por favor describí con mayor detalle alguna particularidad o seña privada del objeto para verificar que sos la persona indicada.";
    errorReclamo.hidden = false;
    return;
  }

  if (!Array.isArray(obj.reclamos)) obj.reclamos = [];

  const reclamoExistente = obj.reclamos.find(
    (r) => r.usuarioCorreo && r.usuarioCorreo.toLowerCase() === usuarioActual.correo.toLowerCase()
  );

  if (reclamoExistente) {
    reclamoExistente.duenioDeclarado = duenioDeclarado;
    reclamoExistente.particularidades = particularidades;
    reclamoExistente.contacto = contacto || "No especificado";
    reclamoExistente.fechaReclamo = formatearFechaLegible(obtenerFechaHoyISO());
    reclamoExistente.estadoReclamo = "pendiente";
    guardarTodo();
    renderizarTablero();
    abrirModalDetalle(obj.id);
    mostrarToast("✅ ¡Solicitud actualizada y enviada nuevamente a verificación!");
    return;
  }

  obj.reclamos.push({
    idReclamo: `rec-${Date.now()}`,
    duenioDeclarado,
    usuarioNombre: `${usuarioActual.nombre} ${usuarioActual.apellido}`,
    usuarioCorreo: usuarioActual.correo,
    usuarioFacultad: usuarioActual.facultad,
    usuarioCarrera: usuarioActual.carrera,
    contacto: contacto || "No especificado",
    particularidades,
    fechaReclamo: formatearFechaLegible(obtenerFechaHoyISO()),
    estadoReclamo: "pendiente"
  });

  guardarTodo();
  renderizarTablero();
  abrirModalDetalle(obj.id);
  mostrarToast("🙋‍♂️ ¡Solicitud enviada! El Administrador comparará tus particularidades con el objeto real.");
}

function renderizarReclamosParaAdmin(obj) {
  const reclamos = Array.isArray(obj.reclamos) ? obj.reclamos : [];
  contadorReclamosDetalle.textContent = reclamos.length;
  listaReclamosAdmin.innerHTML = "";

  if (reclamos.length === 0) {
    listaReclamosAdmin.innerHTML = `
      <p class="form-hint">Todavía nadie envió una solicitud reclamando este objeto.</p>
    `;
    return;
  }

  reclamos.forEach((rec) => {
    const nombreDuenio = rec.duenioDeclarado || rec.usuarioNombre;
    const estadoRec = rec.estadoReclamo || "pendiente";
    let badgeEstadoHTML = `<span class="status-badge status-reclamo">⏳ En revisión</span>`;
    let claseExtraCard = "";

    if (estadoRec === "rechazado") {
      badgeEstadoHTML = `<span class="status-badge" style="background:#fee2e2; color:#991b1b; border:1px solid #f87171;">❌ Rechazado</span>`;
      claseExtraCard = "claim-item-rejected";
    } else if (estadoRec === "aprobado") {
      badgeEstadoHTML = `<span class="status-badge status-recuperado">✅ Aprobado</span>`;
      claseExtraCard = "claim-item-approved";
    }

    const card = document.createElement("div");
    card.className = `claim-item-card ${claseExtraCard}`.trim();
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
        <div>
          <strong>🙋‍♂️ Solicitante: ${escaparHTML(rec.usuarioNombre)}</strong>
          <span class="form-hint">(${escaparHTML(rec.usuarioCorreo)})</span>
        </div>
        ${badgeEstadoHTML}
      </div>
      <div class="form-hint">
        👤 <strong>Dueño declarado para retiro:</strong> ${escaparHTML(nombreDuenio)} | 📞 ${escaparHTML(rec.contacto)}
      </div>
      <div class="form-hint">
        🎓 ${escaparHTML(rec.usuarioFacultad)} · ${escaparHTML(rec.usuarioCarrera)}
      </div>
      <div class="claim-particularidades">
        <strong>Particularidades declaradas para demostrar que es suyo:</strong><br/>
        "${escaparHTML(rec.particularidades)}"
      </div>
    `;

    if (obj.estado !== "recuperado") {
      const accionesDiv = document.createElement("div");
      accionesDiv.className = "claim-admin-actions";

      const btnPrepararEntrega = document.createElement("button");
      btnPrepararEntrega.type = "button";
      btnPrepararEntrega.className = "btn btn-success btn-small";
      btnPrepararEntrega.textContent = "✅ Coincide · Cargar datos para devolver";
      btnPrepararEntrega.addEventListener("click", () => {
        reclamoPreseleccionadoId = rec.idReclamo;
        detailsEntregaManual.open = true;
        adminInputDestinatario.value = `${nombreDuenio} (${rec.usuarioFacultad} - ${rec.usuarioCarrera}) · ${rec.usuarioCorreo}`;
        adminInputParticularidades.value = rec.particularidades;
        adminInputDestinatario.focus();
        mostrarToast("📝 Verificá o editá el nombre del dueño debajo y presioná 'Confirmar devolución'.");
      });
      accionesDiv.appendChild(btnPrepararEntrega);

      if (estadoRec !== "rechazado") {
        const btnRechazar = document.createElement("button");
        btnRechazar.type = "button";
        btnRechazar.className = "btn btn-danger-outline btn-small";
        btnRechazar.textContent = "❌ No coincide · Rechazar reclamo";
        btnRechazar.addEventListener("click", () => {
          descartarReclamoAdmin(obj.id, rec.idReclamo, rec.usuarioNombre);
        });
        accionesDiv.appendChild(btnRechazar);
      } else {
        const btnBorrarDefinitivo = document.createElement("button");
        btnBorrarDefinitivo.type = "button";
        btnBorrarDefinitivo.className = "btn btn-secondary btn-small";
        btnBorrarDefinitivo.textContent = "🗑️ Borrar del historial";
        btnBorrarDefinitivo.addEventListener("click", () => {
          eliminarReclamoDefinitivoAdmin(obj.id, rec.idReclamo, rec.usuarioNombre);
        });
        accionesDiv.appendChild(btnBorrarDefinitivo);
      }

      card.appendChild(accionesDiv);
    }

    listaReclamosAdmin.appendChild(card);
  });
}

function descartarReclamoAdmin(idObjeto, idReclamo, nombreSolicitante) {
  if (!esAdminActual()) return;
  const obj = listaObjetos.find((item) => item.id === idObjeto);
  if (!obj || !Array.isArray(obj.reclamos)) return;

  const rec = obj.reclamos.find((r) => r.idReclamo === idReclamo);
  if (!rec) return;

  const confirmar = window.confirm(
    `¿Confirmás rechazar la solicitud de ${nombreSolicitante} porque las particularidades no coinciden?\n\nEl usuario verá el aviso de rechazo en su sección 'Mis reclamos enviados' y podrá corregir sus datos si cometió un error.`
  );
  if (!confirmar) return;

  rec.estadoReclamo = "rechazado";
  guardarTodo();
  renderizarTablero();
  abrirModalDetalle(obj.id);
  mostrarToast("❌ Reclamo marcado como rechazado. El solicitante fue notificado en su panel.");
}

function eliminarReclamoDefinitivoAdmin(idObjeto, idReclamo, nombreSolicitante) {
  if (!esAdminActual()) return;
  const obj = listaObjetos.find((item) => item.id === idObjeto);
  if (!obj || !Array.isArray(obj.reclamos)) return;

  const confirmar = window.confirm(
    `¿Eliminar definitivamente del historial el reclamo rechazado de ${nombreSolicitante}?`
  );
  if (!confirmar) return;

  obj.reclamos = obj.reclamos.filter((r) => r.idReclamo !== idReclamo);
  guardarTodo();
  renderizarTablero();
  abrirModalDetalle(obj.id);
  mostrarToast("🗑️ Reclamo eliminado del historial.");
}

function confirmarDevolucionVerificada(idObjeto, destinatarioTexto, particularidadesTexto) {
  if (!esAdminActual()) {
    mostrarToast("⛔ Solo el Administrador puede registrar la devolución verificada.");
    return;
  }

  const obj = listaObjetos.find((item) => item.id === idObjeto);
  if (!obj) return;

  obj.estado = "recuperado";
  obj.datosEntrega = {
    destinatario: destinatarioTexto,
    particularidadesVerificadas: particularidadesTexto,
    fechaEntrega: formatearFechaLegible(obtenerFechaHoyISO())
  };

  if (Array.isArray(obj.reclamos)) {
    obj.reclamos.forEach((r) => {
      if (
        (reclamoPreseleccionadoId && r.idReclamo === reclamoPreseleccionadoId) ||
        (!reclamoPreseleccionadoId &&
          r.usuarioCorreo &&
          destinatarioTexto.toLowerCase().includes(r.usuarioCorreo.toLowerCase()))
      ) {
        r.estadoReclamo = "aprobado";
      }
    });
  }
  reclamoPreseleccionadoId = null;

  guardarTodo();
  renderizarTablero();
  abrirModalDetalle(obj.id);
  mostrarToast("✅ Devolución verificada y registrada a la persona indicada.");
}

function procesarEntregaManualAdmin(evento) {
  evento.preventDefault();
  if (!esAdminActual() || !objetoSeleccionadoId) return;

  const destinatario = adminInputDestinatario.value.trim();
  const particularidades = adminInputParticularidades.value.trim();

  if (!destinatario || !particularidades) return;

  confirmarDevolucionVerificada(objetoSeleccionadoId, destinatario, particularidades);
  formEntregaManual.reset();
}

function revertirObjetoAPendiente() {
  if (!esAdminActual() || !objetoSeleccionadoId) return;

  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj) return;

  obj.estado = "encontrado";
  obj.datosEntrega = null;
  if (Array.isArray(obj.reclamos)) {
    obj.reclamos.forEach((r) => {
      if (r.estadoReclamo === "aprobado") {
        r.estadoReclamo = "pendiente";
      }
    });
  }
  guardarTodo();
  renderizarTablero();
  abrirModalDetalle(obj.id);
  mostrarToast("↩️ El objeto volvió al estado Pendiente de retiro.");
}

function imprimirComprobanteDevolucion() {
  if (!objetoSeleccionadoId) return;
  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj || obj.estado !== "recuperado" || !obj.datosEntrega) {
    mostrarToast("⚠️ Este objeto aún no cuenta con un registro de devolución verificada.");
    return;
  }

  const ventanaImpresion = window.open("", "_blank", "width=840,height=720");
  if (!ventanaImpresion) {
    mostrarToast("⚠️ Permití las ventanas emergentes en tu navegador para imprimir el comprobante.");
    return;
  }

  const fechaHallazgo = formatearFechaLegible(obj.fecha);
  const htmlComprobante = `<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8" />
  <title>Acta de Devolución Verificada - ${escaparHTML(obj.titulo)} - UNSE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      padding: 2.2rem;
      line-height: 1.5;
    }
    .sheet {
      max-width: 740px;
      margin: 0 auto;
      border: 2px solid #0b1e3b;
      border-radius: 10px;
      padding: 1.75rem 2rem;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #0b1e3b;
      padding-bottom: 1rem;
      margin-bottom: 1.25rem;
    }
    .inst-title {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0b1e3b;
      text-transform: uppercase;
    }
    .inst-subtitle {
      font-size: 0.9rem;
      color: #334155;
      margin-top: 0.15rem;
    }
    .doc-badge {
      background: #ecfdf5;
      color: #065f46;
      border: 1.5px solid #15803d;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 800;
      text-align: right;
    }
    .section-title {
      font-size: 0.9rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #0b1e3b;
      background: #f1f5f9;
      padding: 0.45rem 0.75rem;
      border-left: 4px solid #1d4ed8;
      margin: 1.1rem 0 0.75rem;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 1.25rem;
      font-size: 0.92rem;
    }
    .field-full {
      grid-column: 1 / -1;
    }
    .label {
      font-weight: 700;
      color: #475569;
      display: block;
      font-size: 0.8rem;
      text-transform: uppercase;
    }
    .value {
      font-weight: 600;
      color: #0f172a;
      margin-top: 0.1rem;
    }
    .verified-box {
      background: #f8fafc;
      border: 1px dashed #64748b;
      border-radius: 6px;
      padding: 0.85rem;
      margin-top: 0.4rem;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2.5rem;
      margin-top: 3.2rem;
      padding-top: 1rem;
      text-align: center;
      font-size: 0.85rem;
      color: #334155;
    }
    .sig-line {
      border-top: 1.5px solid #0f172a;
      padding-top: 0.45rem;
      font-weight: 700;
    }
    .footer-note {
      margin-top: 1.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #cbd5e1;
      font-size: 0.78rem;
      color: #64748b;
      text-align: center;
    }
    .no-print {
      max-width: 740px;
      margin: 0 auto 1rem;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
    .btn-action {
      padding: 0.55rem 1rem;
      font-weight: 700;
      border-radius: 6px;
      border: 1px solid #1d4ed8;
      background: #1d4ed8;
      color: #ffffff;
      cursor: pointer;
    }
    .btn-close {
      background: #f1f5f9;
      color: #0f172a;
      border-color: #94a3b8;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .sheet { border-width: 1.5px; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" class="btn-action" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
    <button type="button" class="btn-action btn-close" onclick="window.close()">Cerrar ventana</button>
  </div>
  <div class="sheet">
    <header class="header">
      <div>
        <div class="inst-title">Universidad Nacional de Santiago del Estero (UNSE)</div>
        <div class="inst-subtitle">Tablero Digital de Objetos Perdidos · Acta de Devolución Verificada</div>
      </div>
      <div class="doc-badge">
        ✅ ENTREGADO Y VERIFICADO<br/>
        ID: ${escaparHTML(obj.id.toUpperCase())}
      </div>
    </header>

    <div class="section-title">1. Datos del Objeto Hallado</div>
    <div class="grid">
      <div class="field-full">
        <span class="label">Objeto / Descripción principal</span>
        <div class="value">${escaparHTML(obj.titulo)}</div>
      </div>
      <div>
        <span class="label">Categoría</span>
        <div class="value">${escaparHTML(obj.categoria)}</div>
      </div>
      <div>
        <span class="label">Fecha del hallazgo</span>
        <div class="value">${escaparHTML(fechaHallazgo)}</div>
      </div>
      <div>
        <span class="label">Sector donde fue encontrado</span>
        <div class="value">${escaparHTML(obj.lugarEncontrado)}</div>
      </div>
      <div>
        <span class="label">Sector de resguardo / entrega</span>
        <div class="value">${escaparHTML(obj.lugarRetiro)}</div>
      </div>
      <div class="field-full">
        <span class="label">Reportado inicialmente por</span>
        <div class="value">${escaparHTML(obj.publicadoPor || "Comunidad Universitaria UNSE")}</div>
      </div>
    </div>

    <div class="section-title">2. Constancia de Verificación de Propiedad y Entrega</div>
    <div class="grid">
      <div class="field-full">
        <span class="label">Entregado a (Dueño / Solicitante Verificado)</span>
        <div class="value">${escaparHTML(obj.datosEntrega.destinatario)}</div>
      </div>
      <div>
        <span class="label">Fecha de devolución</span>
        <div class="value">${escaparHTML(obj.datosEntrega.fechaEntrega)}</div>
      </div>
      <div>
        <span class="label">Estado del registro</span>
        <div class="value">Devolución verificada por Administración / Conserjería</div>
      </div>
      <div class="field-full">
        <span class="label">Particularidades o señas comprobadas para acreditar propiedad</span>
        <div class="value verified-box">${escaparHTML(obj.datosEntrega.particularidadesVerificadas)}</div>
      </div>
    </div>

    <div class="signatures">
      <div>
        <div class="sig-line">Firma y Aclaración de quien recibe (Dueño)</div>
        <div>DNI / Legajo: ____________________________</div>
      </div>
      <div>
        <div class="sig-line">Firma y Sello · Responsable de Entrega UNSE</div>
        <div>${escaparHTML(obj.lugarRetiro)}</div>
      </div>
    </div>

    <footer class="footer-note">
      Comprobante emitido por el Sistema de Tablero Digital de Objetos Perdidos de la UNSE · Cátedra Interacción Hombre Computador (IHC 2026).
    </footer>
  </div>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => window.print(), 250);
    });
  </script>
</body>
</html>`;

  ventanaImpresion.document.open();
  ventanaImpresion.document.write(htmlComprobante);
  ventanaImpresion.document.close();
}

function eliminarPublicacionActual() {
  if (!esAdminActual()) {
    mostrarToast("⛔ Acceso denegado: Solo el Administrador puede eliminar publicaciones.");
    return;
  }

  if (!objetoSeleccionadoId) return;
  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj) return;

  const confirmar = window.confirm(
    `¿Confirmás como Administrador eliminar definitivamente la publicación "${obj.titulo}"?`
  );
  if (!confirmar) return;

  listaObjetos = listaObjetos.filter((item) => item.id !== objetoSeleccionadoId);
  objetoSeleccionadoId = null;

  guardarTodo();
  renderizarTablero();
  modalDetalle.close();
  mostrarToast("🗑️ Publicación eliminada por el Administrador.");
}

/* ==========================================================================
   MODAL DE PUBLICACIÓN Y EDICIÓN DE OBJETOS ENCONTRADOS
   ========================================================================== */
function abrirModalPublicacion() {
  if (!usuarioActual) {
    abrirModalAuth("login");
    mostrarToast("🔑 Iniciá sesión o registrate en la UNSE para publicar un objeto encontrado.");
    return;
  }

  objetoEditandoId = null;
  tituloModalPublicar.textContent = "Publicar objeto encontrado";
  btnSubmitPublicar.textContent = "Publicar en el tablero";
  formPublicar.reset();
  limpiarFotoTemporal();
  mensajeErrorForm.hidden = true;
  inputFechaEncontrado.value = obtenerFechaHoyISO();
  publicadorActualInfo.textContent = `Publicando como: ${usuarioActual.nombre} ${usuarioActual.apellido} (${usuarioActual.facultad})`;
  modalPublicar.showModal();
}

function abrirModalEdicionPublicacion() {
  if (!usuarioActual || !objetoSeleccionadoId) return;
  const obj = listaObjetos.find((item) => item.id === objetoSeleccionadoId);
  if (!obj) return;

  if (!esAutorDePublicacion(obj, usuarioActual) && !esAdminActual()) {
    mostrarToast("⛔ Solo el autor de la publicación o el Administrador pueden editar sus datos.");
    return;
  }

  objetoEditandoId = obj.id;
  tituloModalPublicar.textContent = "Editar datos del objeto encontrado";
  btnSubmitPublicar.textContent = "Guardar cambios";
  mensajeErrorForm.hidden = true;
  publicadorActualInfo.textContent = `Editando publicación de: ${obj.publicadoPor}`;

  // Seleccionar categoría
  const radios = contenedorRadiosCategorias.querySelectorAll('input[name="categoria"]');
  radios.forEach((r) => {
    r.checked = r.value === obj.categoria;
  });

  inputLugarEncontrado.value = obj.lugarEncontrado;
  inputLugarRetiro.value = obj.lugarRetiro;
  inputTitulo.value = obj.titulo;
  inputDetalleLugar.value = obj.descripcion || "";
  inputFechaEncontrado.value = obj.fecha || obtenerFechaHoyISO();
  inputParticularidadesHallazgo.value = obj.particularidadesHallazgo || "";

  if (obj.imagen && !obj.imagen.startsWith("data:image/svg+xml")) {
    imagenTemporalBase64 = obj.imagen;
    imgPreview.src = obj.imagen;
    previewFotoContainer.hidden = false;
  } else {
    limpiarFotoTemporal();
  }

  modalDetalle.close();
  modalPublicar.showModal();
}

function limpiarFotoTemporal() {
  imagenTemporalBase64 = null;
  inputFoto.value = "";
  imgPreview.src = "";
  previewFotoContainer.hidden = true;
}

async function manejarCargaDeFoto(evento) {
  const archivo = evento.target.files && evento.target.files[0];
  if (!archivo) return;

  if (!archivo.type.startsWith("image/")) {
    mostrarErrorFormulario("Por favor seleccioná un archivo de imagen válido (JPG, PNG, WebP).");
    return;
  }

  try {
    imagenTemporalBase64 = await comprimirImagen(archivo, 800, 0.8);
    imgPreview.src = imagenTemporalBase64;
    previewFotoContainer.hidden = false;
  } catch (error) {
    console.error("Error al procesar foto:", error);
    mostrarErrorFormulario("No se pudo procesar la fotografía seleccionada.");
  }
}

function mostrarErrorFormulario(mensaje) {
  mensajeErrorForm.textContent = mensaje;
  mensajeErrorForm.hidden = false;
}

function procesarNuevaPublicacion(evento) {
  evento.preventDefault();
  mensajeErrorForm.hidden = true;

  if (!usuarioActual) {
    modalPublicar.close();
    abrirModalAuth("login");
    return;
  }

  const datosForm = new FormData(formPublicar);
  const categoria = datosForm.get("categoria");
  const lugarEncontrado = datosForm.get("lugarEncontrado");
  const lugarRetiro = datosForm.get("lugarRetiro");
  const titulo = (datosForm.get("titulo") || "").trim();
  const descripcion = (datosForm.get("descripcion") || "").trim();
  const fecha = datosForm.get("fecha") || obtenerFechaHoyISO();
  const particularidadesHallazgo = (datosForm.get("particularidadesHallazgo") || "").trim();

  if (!categoria) {
    mostrarErrorFormulario("⚠️ Seleccioná la categoría del objeto (Paso 2).");
    return;
  }
  if (!lugarEncontrado) {
    mostrarErrorFormulario("⚠️ Seleccioná el sector donde encontraste el objeto (Paso 3).");
    return;
  }
  if (!titulo) {
    mostrarErrorFormulario("⚠️ Ingresá un nombre corto para identificar el objeto (Paso 5).");
    return;
  }
  if (!particularidadesHallazgo) {
    mostrarErrorFormulario(
      "⚠️ Completá alguna particularidad privada (Paso 6) para que el Admin pueda verificar a quién pertenece cuando lo reclamen."
    );
    return;
  }

  const imagenFinal =
    imagenTemporalBase64 || generarImagenCategoria(categoria, titulo);

  if (objetoEditandoId) {
    const objExistente = listaObjetos.find((item) => item.id === objetoEditandoId);
    if (objExistente) {
      objExistente.titulo = titulo;
      objExistente.categoria = categoria;
      objExistente.descripcion =
        descripcion || `Encontrado en el sector de ${lugarEncontrado}.`;
      objExistente.particularidadesHallazgo = particularidadesHallazgo;
      objExistente.lugarEncontrado = lugarEncontrado;
      objExistente.lugarRetiro = lugarRetiro;
      objExistente.fecha = fecha;
      objExistente.imagen = imagenFinal;
      objExistente.altText = `Fotografía de ${titulo}, categoría ${categoria}, encontrado en ${lugarEncontrado} y resguardado en ${lugarRetiro}`;
      if (!objExistente.publicadoPorCorreo && esAutorDePublicacion(objExistente, usuarioActual)) {
        objExistente.publicadoPorCorreo = usuarioActual.correo;
      }
    }
    const idActualizado = objetoEditandoId;
    objetoEditandoId = null;
    guardarTodo();
    modalPublicar.close();
    renderizarTablero();
    abrirModalDetalle(idActualizado);
    mostrarToast("✏️ ¡Datos del objeto y particularidad privada actualizados!");
    return;
  }

  const nuevoObjeto = {
    id: `obj-${Date.now()}`,
    titulo,
    categoria,
    descripcion:
      descripcion || `Encontrado en el sector de ${lugarEncontrado}.`,
    particularidadesHallazgo,
    lugarEncontrado,
    lugarRetiro,
    fecha,
    estado: "encontrado",
    imagen: imagenFinal,
    altText: `Fotografía de ${titulo}, categoría ${categoria}, encontrado en ${lugarEncontrado} y resguardado en ${lugarRetiro}`,
    publicadoPor: `${usuarioActual.nombre} ${usuarioActual.apellido} · ${usuarioActual.facultad} (${usuarioActual.carrera})`,
    publicadoPorCorreo: usuarioActual.correo,
    reclamos: [],
    datosEntrega: null
  };

  listaObjetos.unshift(nuevoObjeto);
  guardarTodo();

  modalPublicar.close();
  restablecerTodosLosFiltros();
  mostrarToast("🎉 ¡Objeto publicado! La particularidad privada quedó resguardada solo para el Administrador.");
}

/* ==========================================================================
   GESTIÓN DE EVENTOS Y ATAJOS DE FILTRADO
   ========================================================================== */
function restablecerTodosLosFiltros() {
  filtrosActivos.busqueda = "";
  filtrosActivos.categoria = "todos";
  filtrosActivos.lugar = "todos";
  filtrosActivos.retiro = "todos";
  filtrosActivos.estado = "todos";
  filtrosActivos.fechaDesde = "";
  filtrosActivos.filtroPersonal = "todos";

  inputBusqueda.value = "";
  btnLimpiarBusqueda.hidden = true;
  selectLugar.value = "todos";
  selectRetiro.value = "todos";
  selectEstado.value = "todos";
  inputFechaFiltro.value = "";

  renderizarCatalogosDinamicos();
  renderizarTablero();
}

function inicializarEventos() {
  // 1. Sesión y Autenticación
  btnAbrirAuth.addEventListener("click", () => abrirModalAuth("login"));
  btnCerrarAuth.addEventListener("click", () => modalAuth.close());
  btnCerrarSesion.addEventListener("click", cerrarSesionActual);

  document.querySelectorAll(".btn-toggle-password").forEach((boton) => {
    boton.addEventListener("click", () => alternarVisibilidadPassword(boton));
  });

  tabBtnLogin.addEventListener("click", () => abrirModalAuth("login"));
  tabBtnRegistro.addEventListener("click", () => abrirModalAuth("registro"));

  formLogin.addEventListener("submit", procesarLogin);
  formRegistro.addEventListener("submit", procesarRegistroUsuario);
  formVerificarCodigo.addEventListener("submit", procesarVerificacionCodigo);
  btnReenviarCodigo.addEventListener("click", reenviarNuevoCodigo);

  // 2. Panel de Configuración de Administrador
  btnAbrirAdmin.addEventListener("click", abrirModalAdminConfig);
  btnCerrarAdmin.addEventListener("click", () => modalAdmin.close());
  btnCerrarAdminFooter.addEventListener("click", () => modalAdmin.close());
  formAgregarCategoria.addEventListener("submit", agregarCategoriaAdmin);
  formAgregarLugar.addEventListener("submit", agregarLugarAdmin);
  formAgregarRetiro.addEventListener("submit", agregarRetiroAdmin);
  formConfigEmail.addEventListener("submit", guardarConfiguracionEmailAdmin);
  btnRestaurarDemo.addEventListener("click", restaurarDatosDemo);

  // 3. Atajos de la barra superior de métricas (Pendientes, Reclamos y Entregados)
  statPendientes.addEventListener("click", () => {
    restablecerTodosLosFiltros();
    filtrosActivos.estado = "encontrado";
    selectEstado.value = "encontrado";
    renderizarTablero();
  });

  statReclamos.addEventListener("click", () => {
    restablecerTodosLosFiltros();
    filtrosActivos.estado = "con_reclamo";
    selectEstado.value = "con_reclamo";
    renderizarTablero();
  });

  statRecuperados.addEventListener("click", () => {
    restablecerTodosLosFiltros();
    filtrosActivos.estado = "recuperado";
    selectEstado.value = "recuperado";
    renderizarTablero();
  });

  // 4. Barra de Actividad Personal (Mis publicaciones y Mis reclamos enviados)
  btnFiltroMisPublicaciones.addEventListener("click", () => {
    seleccionarFiltroPersonal("mis_publicaciones");
  });

  btnFiltroMisReclamos.addEventListener("click", () => {
    seleccionarFiltroPersonal("mis_reclamos");
  });

  btnQuitarFiltroPersonal.addEventListener("click", () => {
    filtrosActivos.filtroPersonal = "todos";
    renderizarTablero();
  });

  // 5. Buscador y filtros secundarios
  inputBusqueda.addEventListener("input", (e) => {
    filtrosActivos.busqueda = e.target.value;
    btnLimpiarBusqueda.hidden = filtrosActivos.busqueda.trim() === "";
    renderizarTablero();
  });

  btnLimpiarBusqueda.addEventListener("click", () => {
    filtrosActivos.busqueda = "";
    inputBusqueda.value = "";
    btnLimpiarBusqueda.hidden = true;
    inputBusqueda.focus();
    renderizarTablero();
  });

  selectLugar.addEventListener("change", (e) => {
    filtrosActivos.lugar = e.target.value;
    renderizarTablero();
  });

  selectRetiro.addEventListener("change", (e) => {
    filtrosActivos.retiro = e.target.value;
    renderizarTablero();
  });

  selectEstado.addEventListener("change", (e) => {
    filtrosActivos.estado = e.target.value;
    renderizarTablero();
  });

  inputFechaFiltro.addEventListener("change", (e) => {
    filtrosActivos.fechaDesde = e.target.value;
    renderizarTablero();
  });

  btnResetFiltros.addEventListener("click", restablecerTodosLosFiltros);

  // 6. Modal de Publicación y Edición
  btnAbrirPublicar.addEventListener("click", abrirModalPublicacion);
  btnCerrarPublicar.addEventListener("click", () => modalPublicar.close());
  btnCancelarPublicar.addEventListener("click", () => modalPublicar.close());
  inputFoto.addEventListener("change", manejarCargaDeFoto);
  btnQuitarFoto.addEventListener("click", limpiarFotoTemporal);
  formPublicar.addEventListener("submit", procesarNuevaPublicacion);

  // 7. Modal de Detalle, Edición de Autor, Reclamos y Entrega Verificada
  btnCerrarDetalle.addEventListener("click", () => modalDetalle.close());
  detalleImagen.addEventListener("click", alternarZoomImagenDetalle);
  btnZoomImagen.addEventListener("click", alternarZoomImagenDetalle);
  btnImprimirComprobante.addEventListener("click", imprimirComprobanteDevolucion);
  btnEditarPublicacion.addEventListener("click", abrirModalEdicionPublicacion);
  btnAdminEditarSecreto.addEventListener("click", abrirModalEdicionPublicacion);
  btnAbrirFormReclamo.addEventListener("click", intentarAbrirFormularioReclamo);
  btnEditarMiReclamo.addEventListener("click", abrirEdicionMiReclamo);
  btnCancelarReclamo.addEventListener("click", () => {
    formReclamo.hidden = true;
    abrirModalDetalle(objetoSeleccionadoId);
  });
  formReclamo.addEventListener("submit", procesarEnvioReclamo);
  formEntregaManual.addEventListener("submit", procesarEntregaManualAdmin);
  btnRevertirPendiente.addEventListener("click", revertirObjetoAPendiente);
  btnEliminarPublicacion.addEventListener("click", eliminarPublicacionActual);
  // Nota de usabilidad: Los modales solo se cierran mediante su botón explícito '✕' o 'Cancelar'.
}

/* ==========================================================================
   PUNTO DE ENTRADA DE LA APLICACIÓN
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();
  actualizarInterfazSesion();
  renderizarCatalogosDinamicos();
  inicializarEventos();
  renderizarTablero();
});
