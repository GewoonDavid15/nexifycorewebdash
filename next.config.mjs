const securityHeaders=[
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'X-Frame-Options',value:'DENY'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=(), payment=()'},
  {key:'Cross-Origin-Resource-Policy',value:'same-origin'},
  {key:'Strict-Transport-Security',value:'max-age=31536000'},
  {key:'Content-Security-Policy',value:"frame-ancestors 'none'; base-uri 'self'; object-src 'none'"}
];
export default {
  poweredByHeader:false,
  async headers(){return [{source:'/:path*',headers:securityHeaders}];}
};
