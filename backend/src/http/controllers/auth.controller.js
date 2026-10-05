import * as auth from '../../services/auth/index.js';

export const register = async (req, res) => res.json(await auth.registerOrg(req.body));

export const login = async (req, res) => res.json(await auth.login(req.body.email, req.body.password));
