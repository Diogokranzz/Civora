/**
 * Perfil público do GitHub, mostrado no segundo monitor da mesa (Setup). Dados copiados da API pública
 * em 08/11/2026; atualizar à mão quando mudarem.
 */
export const GITHUB_PROFILE = {
  login: 'DioohReis',
  name: 'Diogo Guilherme de Assis Reis',
  bio: 'Systems Analysis and Development · JavaScript · Java · CSS · HTML · SQL · Fortinet · Python',
  location: 'São Paulo, Brasil',
  avatar: 'https://avatars.githubusercontent.com/u/121978315?v=4',
  repos: 18,
  followers: 23,
  following: 17,
}

export interface GithubRepo {
  name: string
  description: string
  language: string
  stars: number
}

/** Repositórios em destaque, como os fixados no perfil. */
export const GITHUB_REPOS: GithubRepo[] = [
  {
    name: 'soul-up-challenge',
    description: 'Lumen AI: jornada gamificada de sustentabilidade',
    language: 'TypeScript',
    stars: 3,
  },
  {
    name: 'orbitagroCopilot',
    description: 'Monitoramento de lavouras com satélite',
    language: 'JavaScript',
    stars: 2,
  },
  { name: 'portfolio', description: 'Este portfólio, em React e Three.js', language: 'TypeScript', stars: 0 },
  { name: 'campo-minado-py', description: 'Jogo campo minado em Python', language: 'Python', stars: 0 },
]
