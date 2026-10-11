export function databasePoolOptions(env=process.env){
 const options={connectionTimeoutMillis:5000,connectionString:env.DATABASE_URL};
 if(env.NODE_ENV==='production'){
  const url=new URL(env.DATABASE_URL);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  // pg connection-string SSL parameters replace the explicit TLS object.
  // Remove them so verification and the configured CA remain authoritative.
  for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
  options.connectionString=url.toString();
  options.ssl={rejectUnauthorized:true,...(env.DATABASE_CA_CERT?{ca:env.DATABASE_CA_CERT.replace(/\\n/g,'\n')}:{})};
 }
 return options;
}
