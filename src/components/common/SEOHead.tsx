import { useEffect } from 'react';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalPath?: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: object | object[];
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) || 'https://example.com';

export default function SEOHead({
  title,
  description,
  keywords,
  canonicalPath = '/',
  ogType = 'website',
  ogImage,
  jsonLd,
}: SEOHeadProps) {
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const imageUrl = ogImage || `${SITE_URL}/og-image.png`;

  useEffect(() => {
    // Inject or update JSON-LD scripts
    if (!jsonLd) return;

    const schemas = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
    const existingScripts = document.querySelectorAll('script[data-seo-jsonld]');
    existingScripts.forEach((s) => s.remove());

    schemas.forEach((schema) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', 'true');
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    return () => {
      document.querySelectorAll('script[data-seo-jsonld]').forEach((s) => s.remove());
    };
  }, [jsonLd]);

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="SigmaSenseAI" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </>
  );
}
