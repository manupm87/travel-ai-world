import type { Translations } from "./types";

const es: Translations = {
  nav: {
    howItWorks: "Cómo Funciona",
    features: "Funcionalidades",
    reviews: "Opiniones",
    planMyTrip: "Planificar Viaje",
    myDashboard: "Mi Panel",
    dashboard: "Panel",
    home: "Inicio",
  },
  common: {
    planning: "En Planificación",
    planned: "Planificado",
    finished: "Finalizado",
  },
  tripViewer: {
    backToDashboard: "Volver al Panel",
    travelers: "Viajeros",
    totalBudget: "Presupuesto Total",
    viewBookings: "Ver Reservas",
    exportPdf: "Exportar PDF",
    viewItinerary: "Ver Itinerario",
    journeyMap: "Mapa de la Ruta",
    routeOverview: "Resumen de la Ruta",
    tripOverview: "Resumen del Viaje",
    accommodations: "Alojamientos",
    transportation: "Transporte",
    aiInsights: "Sugerencias IA",
    weatherForecast: "Pronóstico del Tiempo",
    localTips: "Consejos Locales",
    yourItinerary: "Tu Itinerario",
    journeyTitle: "Tu Viaje de {duration} Días",
    allDays: "Todos los Días",
    freeDay: "DÍA LIBRE",
    travel: "VIAJE",
    dining: "Gastronomía",
    bookingRequired: "Reserva Necesaria",
    estimated: "estimado",
    selfPlanned: "Planificado por ti",
    nights: "Noches",
    budgetBreakdown: {
      accommodation: "ALOJAMIENTO",
      food: "COMIDA Y CENA",
      activities: "ACTIVIDADES",
      transport: "TRANSPORTE",
    },
  },
  hero: {
    badge: "Planificación de Viajes con IA",
    title: "Tu Viaje Soñado,\nDiseñado por IA.",
    subtitle:
      "Cuéntanos adónde quieres ir, tu presupuesto y tu estilo de viaje. Nuestra IA crea un itinerario personalizado, día a día, hecho justo para ti — en segundos.",
    ctaPrimary: "Planificar Mi Viaje Gratis",
    ctaSecondary: "Ver Cómo Funciona ↓",
    trust1: "✓ Sin tarjeta de crédito",
    trust2: "✓ +50.000 viajes planificados",
    trust3: "✓ +190 destinos",
  },
  planner: {
    label: "Planifica Tu Viaje",
    title: "Dile a la IA adónde quieres ir",
    destination: "Destino",
    destinationPlaceholder: "¿Adónde quieres ir?",
    dates: "Fechas de Viaje",
    datesPlaceholder: "¿Cuándo vas a viajar?",
    budget: "Presupuesto",
    budgetPlaceholder: "Tu presupuesto total",
    travelers: "Viajeros",
    travelersPlaceholder: "¿Cuántas personas?",
    travelStyle: "Estilo de Viaje",
    styles: [
      { emoji: "🏔", label: "Aventura" },
      { emoji: "🌴", label: "Relax" },
      { emoji: "🏛", label: "Cultura" },
      { emoji: "🍜", label: "Gastronomía" },
      { emoji: "💑", label: "Romántico" },
      { emoji: "🎒", label: "Mochilero" },
    ],
    generate: "Generar Mi Itinerario Perfecto",
    comingSoon: "¡Próximamente — backend en desarrollo!",
    comingSoonNote:
      "El generador de viajes con IA estará disponible cuando conectemos el backend FastAPI. ¡Estén atentos!",
  },
  howItWorks: {
    label: "Cómo Funciona",
    title: "Tres pasos hacia tu\nescapada perfecta.",
    steps: [
      {
        number: "1",
        title: "Cuéntanos tus Sueños",
        description:
          "Introduce tu destino, fechas de viaje, presupuesto, número de personas y el tipo de viaje que buscas. Tarda menos de 60 segundos.",
      },
      {
        number: "2",
        title: "La IA Crea tu Itinerario",
        description:
          "Nuestra IA analiza miles de opciones, reseñas e información local para crear un itinerario personalizado día a día.",
      },
      {
        number: "3",
        title: "Vive la Experiencia",
        description:
          "Descarga tu itinerario, reserva directamente o déjanos gestionar las reservas. Tu aventura comienza con un solo clic.",
      },
    ],
  },
  features: {
    label: "Por Qué Elegir Travel AI World",
    title: "Planificación más inteligente,\nmomentos más memorables.",
    items: [
      {
        emoji: "🧠",
        title: "IA Hiperpersonalizada",
        description:
          "Aprende tus preferencias para sugerirte experiencias que realmente encajan con tu estilo — no solo trampas para turistas.",
      },
      {
        emoji: "📅",
        title: "Itinerarios Día a Día",
        description:
          "Horarios detallados, tiempos y logística para cada día de tu viaje — optimizados para viajar menos y disfrutar más.",
      },
      {
        emoji: "💰",
        title: "Control Inteligente del Presupuesto",
        description:
          "Fija tu presupuesto y observa cómo la IA optimiza cada recomendación — desde hoteles a restaurantes — ajustándose a tu límite.",
      },
      {
        emoji: "🗺️",
        title: "Mapas Interactivos",
        description:
          "Mapas visuales con toda tu ruta, la ubicación de los hoteles y los imprescindibles de un vistazo.",
      },
      {
        emoji: "🍽️",
        title: "Guía Gastronómica Local",
        description:
          "Recomendaciones de restaurantes seleccionados para cada comida, filtradas por cocina, presupuesto y ubicación.",
      },
      {
        emoji: "✏️",
        title: "Totalmente Personalizable",
        description:
          "¿No te gusta alguna sugerencia? Edita, intercambia o regenera cualquier parte del itinerario con un solo clic.",
      },
    ],
  },
  socialProof: {
    label: "La Elección de los Viajeros",
    stats: [
      { value: "+50.000", label: "Viajes Generados" },
      { value: "+190",    label: "Destinos Disponibles" },
      { value: "4,9★",   label: "Valoración Media" },
      { value: "30s",    label: "Tiempo Medio de Planificación" },
    ],
    testimonials: [
      {
        stars: 5,
        quote:
          "Planifiqué un viaje de 2 semanas a Japón en menos de 5 minutos. La IA incluso encontró un festival de cerezos del que no sabía nada. Absolutamente mágico.",
        author: "Sofia M.",
        location: "Madrid 🇪🇸",
        highlight: false,
      },
      {
        stars: 5,
        quote:
          "Teníamos un presupuesto ajustado para nuestra luna de miel. Travel AI World encontró un paquete increíble en Santorini, optimizando todo. Ahorramos 800€ frente a reservar manualmente.",
        author: "Luca y Emma",
        location: "Milán 🇮🇹",
        highlight: true,
      },
      {
        stars: 5,
        quote:
          "El itinerario día a día de nuestra aventura en Costa Rica fue perfecto. Cada actividad estaba cerca, los tiempos tenían sentido. Sin tiempo perdido, pura felicidad.",
        author: "James K.",
        location: "Londres 🇬🇧",
        highlight: false,
      },
    ],
  },
  finalCta: {
    title: "¿Listo para explorar el mundo?",
    subtitle:
      "Únete a miles de viajeros que planifican de forma más inteligente. Tu próxima aventura está a solo 30 segundos.",
    ctaPrimary: "Empieza Gratis",
    ctaSecondary: "Ver Demo",
  },
  footer: {
    tagline:
      "Planificación de viajes con IA para el explorador moderno. De la idea al itinerario en 30 segundos.",
    links: {
      Producto: ["Cómo Funciona", "Funcionalidades", "Precios", "Viajes de Ejemplo"],
      Destinos: ["Europa", "Asia", "Américas", "Todos los Destinos"],
      Empresa:  ["Quiénes Somos", "Blog", "Política de Privacidad", "Términos de Uso"],
    },
    copyright: "© 2025 Travel AI World. Todos los derechos reservados.",
  },
  planPage: {
    title: "Planificador de Viajes",
    description:
      "El planificador de viajes con IA estará disponible próximamente. Lo estamos conectando con nuestro backend FastAPI. ¡Vuelve pronto!",
    back: "← Volver al Inicio",
  },
  tripPage: {
    title: "Viaje",
    description:
      "El visualizador de itinerarios generado por IA está en construcción. Una vez que nuestro backend FastAPI esté en funcionamiento, los detalles de tu viaje aparecerán aquí.",
    back: "← Volver al Inicio",
  },
  dashboard: {
    heroTitle: "Planifica Tu Próxima Aventura",
    sections: {
      planned: "Tu Próxima Aventura",
      planning: "En planificación",
      finished: "Viajes pasados",
    },
    emptyTitle: "Tu atlas está esperando",
    emptyDescription: "Aún no has planificado ningún viaje. Comienza tu próxima aventura con nuestro planificador IA.",
  },
  auth: {
    login: "Iniciar Sesión",
    logout: "Cerrar Sesión",
    loginWithGoogle: "Continuar con Google",
    welcomeBack: "Bienvenido de nuevo",
    signingIn: "Iniciando sesión...",
    loggedIn: "Sesión iniciada"
  },
  notFound: {
    title: "404",
    subtitle: "404 - Perdido en el Paraíso",
    description: "Incluso los mejores planes de viaje pueden desviarse. Parece que has descubierto una isla que no está en nuestros mapas.",
    cta: "Volver a la Civilización"
  }
};


export default es;
