import { supabase } from './supabase';
import { entities } from './entities';

const auth = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw Object.assign(new Error('Not authenticated'), { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return profile || user;
  },

  async updateMe(data) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('profiles')
      .update(data)
      .eq('id', user.id);

    if (error) throw new Error(error.message);
    return true;
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  },

  async redirectToLogin(returnUrl) {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: returnUrl || window.location.origin },
    });
  },
};

export const base44 = {
  auth,
  entities,
};
