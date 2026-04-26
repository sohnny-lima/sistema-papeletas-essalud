import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-theme-switcher',
  standalone: true,
  templateUrl: './theme-switcher.component.html',
  styleUrls: ['./theme-switcher.component.css'],
  imports: [
    CommonModule
  ]
})
export class ThemeSwitcherComponent implements OnInit {
  selectedTheme: string = 'light';

  ngOnInit(): void {
    const theme = this.getStoredTheme();
    this.applyTheme(theme);
    this.showActiveTheme(theme);
  }

  private getStoredTheme(): string {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  }

  private applyTheme(theme: string): void {
    const themeToApply = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', themeToApply);
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(themeToApply);
    this.selectedTheme = themeToApply;
  }

  private showActiveTheme(theme: string, focus: boolean = false): void {
    const themeSwitcher = document.querySelector('#bd-theme');
    
    if (!themeSwitcher) {
      return;
    }

    
    const themeSwitcherText = document.querySelector('#bd-theme-text');
    const activeThemeIcon = document.querySelector('.theme-icon-active use');
    const btnToActive = document.querySelector(`[data-bs-theme-value="${theme}"]`);
    const svgOfActiveBtn = btnToActive?.querySelector('svg use')?.getAttribute('href') || '';

    document.querySelectorAll('[data-bs-theme-value]').forEach(element => {
      element.classList.remove('active');
      element.setAttribute('aria-pressed', 'false');
    });

    btnToActive?.classList.add('active');
    btnToActive?.setAttribute('aria-pressed', 'true');
    if (activeThemeIcon) {
      activeThemeIcon.setAttribute('href', svgOfActiveBtn);
    }
    const themeSwitcherLabel = `${themeSwitcherText?.textContent} (${(btnToActive as HTMLElement)?.dataset['bsThemeValue']})`;
    themeSwitcher.setAttribute('aria-label', themeSwitcherLabel);

    if (focus) {
      (themeSwitcher as HTMLElement).focus();
    }
  }

  

  setTheme(theme: string): void {
    const themeToApply = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('theme', themeToApply);
    this.applyTheme(themeToApply);
    this.showActiveTheme(themeToApply, true);
  }
}
