import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  isVisible: boolean;
  duration?: number;
  className?: string;
  delay?: number;
}

export default function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  isVisible,
  duration = 1800,
  className = '',
  delay = 0,
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!isVisible || hasStarted.current) return;

    const timer = setTimeout(() => {
      hasStarted.current = true;

      const animate = (timestamp: number) => {
        if (!startTimeRef.current) startTimeRef.current = timestamp;
        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic for natural deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(eased * value);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setCount(value);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isVisible, value, duration, delay]);

  const raw = count.toFixed(decimals);
  // Add thousands comma for large integers
  const formatted =
    decimals === 0 && value >= 1000
      ? parseInt(raw, 10).toLocaleString()
      : raw;

  return (
    <span className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
