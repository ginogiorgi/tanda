/**
 * Vercel Web Analytics (Plan 5 W, gratis en Hobby) SIN JS propio en el bundle: el layout raíz pone el script
 * oficial (`/_vercel/insights/script.js`, `defer`, solo en Vercel) y este snippet inline que registra el
 * `beforeSend` en la cola `vaq` antes de que cargue. El script sigue solo las navegaciones del App Router.
 *
 * Privacidad: sin cookies ni PII; las URLs viajan SIN query ni hash (puede haber tokens en flujos de auth) y el
 * código de sala normalizado (`/sala/:code`) para que todas las salas cuenten como una sola pantalla.
 */
export const WEB_ANALYTICS_SRC = "/_vercel/insights/script.js";

export const WEB_ANALYTICS_INIT = `window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};window.va("beforeSend",function(e){try{var u=new URL(e.url);u.search="";u.hash="";u.pathname=u.pathname.replace(/^\\/sala\\/[^/]+/,"/sala/:code");e.url=u.toString()}catch(x){}return e});`;

export function webAnalyticsEnabled(): boolean {
  return !!process.env.VERCEL_ENV;
}
