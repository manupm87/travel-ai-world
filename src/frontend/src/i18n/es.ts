import type { Translations } from "./types";

const es: Translations = {
  nav: {
    howItWorks: "Cómo Funciona",
    features: "Funcionalidades",
    reviews: "Opiniones",
    planMyTrip: "Planificar Viaje",
    dashboard: "Dashboard",
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    selectLanguage: "Seleccionar idioma",
    userMenu: "Menú de cuenta",
    menu: "Menú",
  },
  common: {
    loading: "Cargando...",
    close: "Cerrar",
  },
  status: {
    planning: "En Planificación",
    planned: "Planificado",
    finished: "Finalizado",
  },
  errors: {
    title: "¡Vaya! Algo ha salido mal.",
    description: "Se ha producido un error inesperado al cargar esta página.",
    retry: "Reintentar",
  },
  tripViewer: {
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
    weatherUnavailable: "La información meteorológica no está disponible para este viaje.",
    localTips: "Consejos Locales",
    noLocalTips: "Aún no hay consejos locales disponibles.",
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
    loading: "Cargando tu viaje…",
    notFoundTitle: "No encontramos ese viaje",
    notFoundDescription: "Puede que se haya borrado o que el enlace sea incorrecto. Tus viajes te esperan en el panel.",
    backToDashboard: "Volver a mis viajes",
    errorTitle: "No pudimos cargar tu viaje",
    errorDescription: "Algo salió mal al hablar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
    retry: "Intentar de nuevo",
  },
  hero: {
    badge: "Planificación de Viajes con IA",
    title: "Tu Viaje Soñado,\nDiseñado por IA.",
    subtitle:
      "Cuéntanos adónde quieres ir, tu presupuesto y tu estilo de viaje. Nuestra IA crea un itinerario personalizado, día a día, hecho justo para ti — en segundos.",
    ctaPrimary: "Planificar Mi Viaje Gratis",
    ctaSecondary: "Ver Cómo Funciona ↓",
    trust: [
      "✓ Sin tarjeta de crédito",
      "✓ +50.000 viajes planificados",
      "✓ +190 destinos",
    ],
    imageAlt: "Paisaje de montaña espectacular al atardecer",
  },
  planner: {
    label: "Planifica tu viaje",
    title: "Dile a la IA adónde quieres ir",
    placeholder:
      "Un viaje de 7 días a Lisboa en octubre para una pareja, presupuesto medio…",
    send: "Enviar",
    sendHint: "↵ Enviar · ⇧↵ Salto de línea",
    examplesLabel: "Prueba con una de estas",
    examples: [
      {
        emoji: "🇵🇹",
        label: "Fin de semana en Lisboa",
        prompt:
          "Planifica un fin de semana de 3 días en Lisboa para dos, centrado en gastronomía y arquitectura.",
      },
      {
        emoji: "🇯🇵",
        label: "10 días en Japón",
        prompt:
          "10 días en Japón en primavera: Tokio, Kioto y una parada fuera de los circuitos clásicos.",
      },
      {
        emoji: "👨‍👩‍👧",
        label: "Madrid en familia",
        prompt:
          "Un viaje de 4 días a Madrid en familia con dos niños (8 y 11), preferimos días con poca caminata.",
      },
      {
        emoji: "🏔",
        label: "Aventura en la Patagonia",
        prompt:
          "Viaje de aventura de 2 semanas por la Patagonia, senderismo y aire libre, a finales de noviembre.",
      },
    ],
    unavailable:
      "El planificador con IA necesita un backend conectado, así que no está disponible en esta vista estática.",
    errorFallback:
      "Lo siento, no pude procesar tu solicitud. Inténtalo de nuevo.",
    errorUnauthorized:
      "Tu sesión ha caducado. Vuelve a iniciar sesión para seguir planificando.",
  },
  plan: {
    title: "Planificar un viaje",
    subtitle: "Habla, elige entre las tarjetas y mira cómo el itinerario toma forma a la derecha.",
    tabs: { chat: "Chat", trip: "Viaje", map: "Mapa" },
    openPlanner: "Planificar un viaje",
    openWithPrompt: "Continuar en el planificador completo →",
    composerPlaceholder: "Pide un cambio o busca algo…",
    chosen: "Elegido: {titles}",
    suggestions: [
      "Hazlo más barato",
      "Añade una tarde de spa",
      "Restaurantes locales cerca",
    ],
    cityStarter: "Planifica un viaje a {city}",
    quickReplies: {
      title: "Afinemos un poco más:",
      confirm: "Confirmar",
      destination: "Destino",
      destinationPlaceholder: "Budapest",
      origin: "¿Desde dónde?",
      originPlaceholder: "Madrid",
      dates: "Fechas",
      from: "Desde",
      to: "Hasta",
      travellers: "Viajeros",
      adults: "Adultos",
      children: "Niños",
      increase: "Añadir uno",
      decrease: "Quitar uno",
      budget: "Presupuesto",
      interests: "Qué os apetece",
      interestOptions: [
        { id: "food", label: "Gastronomía" },
        { id: "thermal_baths", label: "Balnearios" },
        { id: "history", label: "Historia" },
        { id: "architecture", label: "Arquitectura" },
        { id: "nightlife", label: "Vida nocturna" },
        { id: "museums", label: "Museos" },
        { id: "nature", label: "Naturaleza" },
        { id: "shopping", label: "Compras" },
      ],
      summary: {
        destination: "Destino: {value}",
        origin: "Salimos desde {value}",
        dates: "Fechas: del {from} al {to}",
        travellers: "Viajeros: {adults} adultos, {children} niños",
        budget: "Presupuesto: {value}",
        interests: "Intereses: {value}",
      },
    },
    priceTiers: { "1": "€", "2": "€€", "3": "€€€" },
    priceTierNames: { "1": "Económico", "2": "Medio", "3": "Alto" },
    parts: { morning: "Mañana", afternoon: "Tarde", evening: "Atardecer", night: "Noche" },
    card: {
      choose: "Elegir",
      chosen: "Elegido",
      addToSlot: "Añadir al día {day} · {part}",
      addCount: "Añadir {count}",
      notInterested: "No me interesa",
      shortlist: "Guardar en favoritos",
      unshortlist: "Quitar de favoritos",
      source: "Fuente: {source}",
      imageCredit: "Foto: {credit}",
      alreadyInDay: "Ya está en tu día",
    },
    carousel: {
      label: "Opciones: {prompt}",
      roleDescription: "carrusel",
      previous: "Opciones anteriores",
      next: "Opciones siguientes",
    },
    checklist: {
      title: "Tu viaje va tomando forma",
      progress: "{done} de {total} datos listos",
      fields: {
        destination: "Destino",
        origin: "Origen",
        dates: "Fechas",
        travellers: "Viajeros",
        interests: "Qué buscas",
      },
      pending: "Respondiendo en el chat…",
      nights: "{nights} noches",
      nightOne: "1 noche",
      adults: "{adults} adultos",
      adultsAndChildren: "{adults} adultos, {children} niños",
      generate: "Generar mi viaje",
      generateHint:
        "Lo genero ahora y completo lo que falte con opciones por defecto, o sigue chateando.",
      generateMessage: "Genera el viaje",
    },
    panel: {
      draft: "Borrador · en planificación",
      heading: "{count} días en {destination}",
      headingNoDestination: "Tu viaje",
      days: "{count} días",
      dayOne: "1 día",
      experiences: "{count} experiencias",
      experienceOne: "1 experiencia",
      hotel: "1 hotel",
      legs: "{count} trayectos",
      legOne: "1 trayecto",
      save: "Guardar viaje",
      saveHint: "Guardar en tus viajes llegará en la próxima entrega.",
      reset: "Empezar de nuevo",
      route: "Ruta {from} → {to}",
      searchFlights: "Buscar vuelos",
      mapTitle: "Mapa",
      mapPlaceholder: "El mapa llega en la próxima entrega. Tus paradas están listadas abajo.",
      daysNav: "Días",
      stopsOfDay: "Paradas del día {day}",
      stay: "Alojamiento · {nights} noches",
      stayNoNights: "Alojamiento",
      change: "Cambiar",
      remove: "Quitar",
      day: "Día {day}",
      showDay: "Mostrar el día {day}",
      hideDay: "Ocultar el día {day}",
      emptySlot: "Nada todavía",
      priceNote: "Sin precios: los precios en directo llegan en la fase 2.",
      weatherSource: "Tiempo: {source}",
      warnings: {
        too_far: "Lejos de la parada anterior",
        closed: "Cerrado ese día",
        overloaded_day: "Este día va muy cargado",
        unverified_price: "Precio sin verificar",
      },
    },
    alternatives: {
      title: "Alternativas para",
      slot: "Día {day} · {part}",
      close: "Cerrar alternativas",
      current: "Actual",
      none: "Todavía no hay alternativas para este hueco.",
      loading: "Buscando alternativas…",
      askMore: "Pedir más opciones en el chat",
      askMessage: "Alternativas para el día {day} · {part}",
      askStayMessage: "Otras opciones de hotel, por favor",
      shortlist: "Favoritos · {count}",
    },
    errors: {
      generic: "Lo siento, algo ha fallado al planificar. Inténtalo de nuevo.",
      unauthorized: "Tu sesión ha caducado. Vuelve a iniciar sesión para seguir planificando.",
    },
    demo: {
      title: "Modo demo",
      body:
        "El backend del planificador aún no está conectado, así que esto es una sesión de Budapest grabada: lugares, fotos y fuentes reales, pero las mismas respuestas para todos. No se guarda nada.",
      dismiss: "Ocultar este aviso",
    },
  },
  howItWorks: {
    label: "Cómo Funciona",
    title: "Tres pasos hacia tu\nescapada perfecta.",
    steps: [
      {
        id: "tell",
        imageAlt: "Persona planificando un viaje en su portátil",
        number: "1",
        title: "Cuéntanos tus Sueños",
        description:
          "Introduce tu destino, fechas de viaje, presupuesto, número de personas y el tipo de viaje que buscas. Tarda menos de 60 segundos.",
      },
      {
        id: "build",
        imageAlt: "IA generando un plan de viaje",
        number: "2",
        title: "La IA Crea tu Itinerario",
        description:
          "Nuestra IA analiza miles de opciones, reseñas e información local para crear un itinerario personalizado día a día.",
      },
      {
        id: "live",
        imageAlt: "Pareja feliz viajando",
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
        id: "personalized",
        emoji: "🧠",
        title: "IA Hiperpersonalizada",
        description:
          "Aprende tus preferencias para sugerirte experiencias que realmente encajan con tu estilo — no solo trampas para turistas.",
      },
      {
        id: "itineraries",
        emoji: "📅",
        title: "Itinerarios Día a Día",
        description:
          "Horarios detallados, tiempos y logística para cada día de tu viaje — optimizados para viajar menos y disfrutar más.",
      },
      {
        id: "budget",
        emoji: "💰",
        title: "Control Inteligente del Presupuesto",
        description:
          "Fija tu presupuesto y observa cómo la IA optimiza cada recomendación — desde hoteles a restaurantes — ajustándose a tu límite.",
      },
      {
        id: "maps",
        emoji: "🗺️",
        title: "Mapas Interactivos",
        description:
          "Mapas visuales con toda tu ruta, la ubicación de los hoteles y los imprescindibles de un vistazo.",
      },
      {
        id: "food",
        emoji: "🍽️",
        title: "Guía Gastronómica Local",
        description:
          "Recomendaciones de restaurantes seleccionados para cada comida, filtradas por cocina, presupuesto y ubicación.",
      },
      {
        id: "customizable",
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
    links: [
      { title: "Producto", items: ["Cómo Funciona", "Funcionalidades", "Precios", "Viajes de Ejemplo"] },
      { title: "Destinos", items: ["Europa", "Asia", "Américas", "Todos los Destinos"] },
      { title: "Empresa", items: ["Quiénes Somos", "Blog", "Política de Privacidad", "Términos de Uso"] },
    ],
    social: ["Twitter", "Instagram", "LinkedIn"],
    copyright: "© 2025 Travel AI World. Todos los derechos reservados.",
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
    loading: "Cargando tus viajes…",
    errorTitle: "No hemos podido cargar tus viajes",
    errorDescription: "Algo ha fallado al hablar con el servidor. Comprueba tu conexión e inténtalo de nuevo.",
    retry: "Reintentar",
  },
  auth: {
    login: "Iniciar Sesión",
    logout: "Cerrar Sesión",
    welcomeBack: "Bienvenido de nuevo",
    subtitle: "Únete a Travel AI World para guardar tus itinerarios y explorar el mundo.",
    terms: "Al continuar, aceptas nuestros Términos de Uso y nuestra Política de Privacidad.",
    loginError: "No hemos podido iniciar tu sesión. Inténtalo de nuevo.",
    continueWithGoogle: "Continuar con Google",
    redirecting: "Redirigiendo…",
    completingSignIn: "Completando tu inicio de sesión…",
    callbackError: "No hemos podido completar tu inicio de sesión. Vuelve a intentarlo.",
    backHome: "Volver a la página principal",
  },
  notFound: {
    subtitle: "404 - Perdido en el Paraíso",
    description: "Incluso los mejores planes de viaje pueden desviarse. Parece que has descubierto una isla que no está en nuestros mapas.",
    cta: "Volver a la Civilización",
    redirecting: "Preparando tu aventura...",
    imageAlt: "Isla paradisíaca perdida",
  },
  theme: {
    toggle: "Cambiar tema",
    light: "Modo claro",
    dark: "Modo oscuro"
  }
};


export default es;
