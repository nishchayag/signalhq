// components/TestimonialsCarousel.tsx
"use client";
import React, { useEffect } from "react";
import { useKeenSlider } from "keen-slider/react";
import "keen-slider/keen-slider.min.css";
import Image from "next/image";
const testimonials = [
  {
    name: "Jane Doe",
    feedback: "Absolutely love how simple and intuitive this platform is!",
    avatar: "https://i.pravatar.cc/100?img=1",
    chip: "bg-brand-yellow",
  },
  {
    name: "John Smith",
    feedback: "It made collecting anonymous feedback super easy for my team.",
    avatar:
      "https://tse3.mm.bing.net/th/id/OIP.YjJSBQVO5Cy9RBxwNqfj7AHaJ5?pid=Api&P=0&h=180",
    chip: "bg-brand-mint",
  },
  {
    name: "Alex Johnson",
    feedback: "Highly recommend it to anyone looking for honest input.",
    avatar: "https://i.pravatar.cc/100?img=3",
    chip: "bg-brand-blue",
  },
];

export default function TestimonialsCarousel() {
  const [sliderInstanceRef, slider] = useKeenSlider<HTMLDivElement>({
    loop: true,
    slides: {
      perView: 1,
      spacing: 16,
    },
  });

  // Auto-scroll every 3 seconds
  useEffect(() => {
    if (!slider) return;

    const interval = setInterval(() => {
      slider.current?.next();
    }, 3000);

    return () => clearInterval(interval);
  }, [slider]);

  return (
    <section className="bg-background py-20 px-4 text-center border-t-2 border-ink">
      <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-10">
        Loved by teams and creators
      </h2>
      <div ref={sliderInstanceRef} className="keen-slider max-w-xl mx-auto">
        {testimonials.map((t, i) => (
          <div key={i} className="keen-slider__slide">
            <div className="bg-card p-8 rounded-2xl shadow-solid border-2 border-ink mx-4">
              <span
                className={`inline-flex ${t.chip} rounded-full border-2 border-ink p-1 mb-4`}
              >
                <Image
                  src={t.avatar}
                  alt={t.name}
                  width={64}
                  height={64}
                  className="rounded-full w-16 h-16 border-2 border-ink"
                />
              </span>
              <p className="text-foreground text-lg font-medium">
                “{t.feedback}”
              </p>
              <h4 className="text-sm mt-4 font-bold text-foreground">
                {t.name}
              </h4>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
