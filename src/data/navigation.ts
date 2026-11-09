export interface NavItem {
  id: string
  label: string
  /** Home e Setup ficam na página inicial; as outras têm página própria. */
  href: string
}

/** Itens do cabeçalho. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  { id: 'setup', label: 'Setup', href: '/#setup' },
  { id: 'sobre', label: 'Sobre', href: '/sobre' },
  { id: 'projetos', label: 'Projetos', href: '/projetos' },
  { id: 'certificados', label: 'Certificados', href: '/certificados' },
  { id: 'contato', label: 'Contato', href: '/contato' },
]

/** Texto das partículas no Home. */
export const HERO_LINES = ['Start', 'Hello', 'World']

export const SITE_OWNER = 'Diogo A Reis'

/** Objetos da mesa que levam a uma página; o palco 3D monta cada um pelo `object`. */
export type DeskObject = 'monitor' | 'laptop' | 'pc' | 'controller' | 'phone'

export interface SetupSpot {
  label: string
  /** Uma linha sobre o que a página tem, mostrada quando o objeto ganha destaque. */
  hint: string
  /** Página (ou página + âncora) que o objeto abre. */
  href: string
  object: DeskObject
  /** Ponto da cena 3D onde a etiqueta fica presa (x, y, z). */
  anchor: [number, number, number]
}

/** Menu do site: cada objeto da mesa leva a uma parte do portfólio. */
export const SETUP_SPOTS: SetupSpot[] = [
  {
    label: 'Projetos',
    hint: 'Sites e sistemas que eu construí',
    href: '/projetos',
    object: 'monitor',
    anchor: [0, 5.4, -2.3],
  },
  { label: 'Sobre', hint: 'Quem eu sou e o que estudo', href: '/sobre', object: 'laptop', anchor: [-5.1, 0.1, 3.8] },
  { label: 'Skills', hint: 'As tecnologias que uso', href: '/sobre#skills', object: 'pc', anchor: [7.1, 4.3, -1.2] },
  {
    label: 'Certificados',
    hint: 'Minhas conquistas: cursos e certificações',
    href: '/certificados',
    object: 'controller',
    anchor: [6.1, 1.9, 1.6],
  },
  { label: 'Contato', hint: 'GitHub, LinkedIn e e-mail', href: '/contato', object: 'phone', anchor: [4.2, 0.6, 2.4] },
]
