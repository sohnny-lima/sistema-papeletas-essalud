import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-menu-principal',
  standalone: true,
  templateUrl: './menu-principal.component.html',
  styleUrls: ['./menu-principal.component.css'],
  imports: [CommonModule, RouterModule]
})
export class MenuPrincipalComponent implements OnInit {
  isCollapsed = false; // Controla el estado del sidebar

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    this.syncSidebarWithViewport();
  }

  @HostListener('window:resize')
  onResize() {
    this.syncSidebarWithViewport();
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      this.isCollapsed = true;
    }
  }

  private syncSidebarWithViewport() {
    this.isCollapsed = window.innerWidth <= 768;
  }

  logout() {
    console.log('Logout initiated');
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
