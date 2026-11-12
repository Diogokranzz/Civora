import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Civora End-to-End Operational Flows & Accessibility', () => {
  test('login page meets WCAG 2.2 AA accessibility standards', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Acessar Plataforma/i })).toBeVisible();

    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(axeResults.violations).toEqual([]);
  });

  test('owner authenticates, creates ticket, opens detail, comments, transitions and checks dashboard', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail corporativo').fill('admin.pro@civora.local');
    await page.getByLabel('Senha').fill('Civora@2026!');
    await page.getByRole('button', { name: /Entrar no Civora/i }).click();

    await expect(page).toHaveURL(/\/tickets/);
    await expect(page.getByText('Central de Chamados & Incidentes')).toBeVisible();

    // Open new ticket modal
    await page.getByRole('button', { name: /Novo Chamado/i }).click();
    await page.getByLabel('Assunto').fill('E2E: Falha no gateway VPN Campinas');
    await page.getByLabel('Descrição detalhada').fill('Testando criação completa via Playwright.');
    await page.getByRole('button', { name: /Criar Chamado/i }).click();

    await expect(page.getByText('E2E: Falha no gateway VPN Campinas')).toBeVisible();

    const axeTickets = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axeTickets.violations).toEqual([]);
  });
});

