
export default eventHandler((event) => {
  
  const env = useRuntimeConfig(event);
  return {
    baseUrl: env.public.BASE_URL
  }
});
