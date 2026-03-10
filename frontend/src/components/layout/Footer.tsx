import Link from "next/link";

const LINKS = {
  Product: [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "#" },
    { label: "Sample Trips", href: "#" },
  ],
  Destinations: [
    { label: "Europe", href: "#" },
    { label: "Asia", href: "#" },
    { label: "Americas", href: "#" },
    { label: "All Destinations", href: "#" },
  ],
  Company: [
    { label: "About", href: "#" },
    { label: "Blog", href: "#" },
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
};

export default function Footer() {
  return (
    <footer className="bg-[#070710] px-16 pt-16 pb-10">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-12">
        {/* Top */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="flex flex-col gap-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 w-fit">
              <div className="w-8 h-8 rounded-md bg-[#4F6EF7] flex items-center justify-center">
                ✈
              </div>
              <span className="text-white font-bold text-base tracking-[3px] uppercase">
                Travel AI World
              </span>
            </Link>
            <p className="text-[#8888AA] text-[13px] leading-relaxed max-w-[240px]">
              AI-powered travel planning for the modern explorer. From idea to
              itinerary in 30 seconds.
            </p>
          </div>

          {/* Links */}
          {Object.entries(LINKS).map(([category, links]) => (
            <div key={category} className="flex flex-col gap-3">
              <h4 className="text-[10px] font-bold text-[#8888AA] tracking-[2px] uppercase">
                {category}
              </h4>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-white/50 text-sm hover:text-white transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/5" />

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-[#8888AA] text-xs">
            © 2025 Travel AI World. All rights reserved.
          </p>
          <div className="flex gap-6">
            {["Twitter", "Instagram", "LinkedIn"].map((s) => (
              <a
                key={s}
                href="#"
                className="text-[#8888AA] text-xs hover:text-white transition-colors"
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
