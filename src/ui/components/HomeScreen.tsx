// Time-aware hero greeting — inspired by LobsterAI CoworkView.tsx (line 55-61)
const resolveHomeGreeting = (): { greeting: string; icon: React.ReactNode } => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return {
      greeting: "Good morning",
      icon: (
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-accent animate-fade-in-up" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
    };
  }
  if (hour >= 12 && hour < 18) {
    return {
      greeting: "Good afternoon",
      icon: (
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-accent animate-fade-in-up" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3v1m0 16v1m-8-9H3m18 0h-1M5.6 5.6l.7.7m12.4 12.4l-.7-.7M5.6 18.4l.7-.7M17.6 5.6l-.7.7" strokeLinecap="round" />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
        </svg>
      ),
    };
  }
  if (hour >= 18 && hour < 23) {
    return {
      greeting: "Good evening",
      icon: (
        <svg viewBox="0 0 24 24" className="h-12 w-12 text-accent animate-fade-in-up" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor" />
        </svg>
      ),
    };
  }
  return {
    greeting: "Late night",
    icon: (
      <svg viewBox="0 0 24 24" className="h-12 w-12 text-accent animate-fade-in-up" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="3" fill="currentColor" />
        <path d="M12 2a10 10 0 0 0 0 20 10 10 0 0 0 0-20z" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  };
};

export function HomeScreen() {
  const { greeting, icon } = resolveHomeGreeting();

  return (
    <>
      {/* Welcome Section — staggered entrance animation (LobsterAI CoworkView pattern) */}
      <div className="w-full max-w-3xl text-center">
        <div className="mx-auto animate-fade-in-scale" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          {icon}
        </div>
        <h2
          className="mt-4 text-2xl font-semibold leading-tight tracking-normal text-ink-800 animate-fade-in-scale"
          style={{ animationDelay: "70ms", animationFillMode: "both" }}
        >
          {greeting}
        </h2>
        <p
          className="mt-2 text-muted animate-fade-in-scale"
          style={{ animationDelay: "120ms", animationFillMode: "both" }}
        >
          What would you like agent cowork to handle?
        </p>
      </div>
    </>
  );
}
