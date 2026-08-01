// auth.js — sesión de cuenta vía Supabase Auth (email/contraseña). Las cuentas se
// crean desde el panel de Supabase (Authentication → Users → Add user), no hay
// registro público dentro de la app.

const Auth = {
  async getSession() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) { console.error(error); return null; }
    return data.session;
  },

  async login(email, password) {
    if (!supabaseClient) throw new Error('Supabase no está configurado (revisa js/supabase-config.js)');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async logout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },
};
