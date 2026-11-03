import { Component, OnInit, AfterViewInit, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { BackendService } from '../services/backend.service';
import { finalize } from 'rxjs';

import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(ChartDataLabels);

interface Estadisticas {
  totalTrabajadores: number;
  totalEquipos: number;
  totalPapeletas: number;
}

@Component({
    selector: 'app-dashboard',
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule]
})
export class DashboardComponent implements OnInit, AfterViewInit {
  estadisticas: Estadisticas | null = null;
  errorMessage: string = '';
  cargando: boolean = true;

  chartEstadisticas: Chart | null = null;

  constructor(private backendService: BackendService, private ngZone: NgZone) {}

  ngOnInit(): void {
    this.cargarEstadisticas();
  }

  ngAfterViewInit(): void {
  }

  cargarEstadisticas(): void {
    this.cargando = true;

    this.backendService.getEstadisticas().pipe(finalize(() => { this.cargando = false; })).subscribe({
      next: (response: any) => {

        if (response.success && response.data) {
          this.estadisticas = {
            totalTrabajadores: response.data.trabajadores || 0,
            totalEquipos: response.data.equipos || 0,
            totalPapeletas: response.data.papeletas || 0
          };

          // Reducir el tiempo de espera
          setTimeout(() => this.renderChart(), 100);
        } else {
          this.errorMessage = "⚠️ No se pudieron cargar las estadísticas.";
        }
        this.cargando = false;
      },
      error: (error: any) => {
        this.errorMessage = "🚨 No se pudieron cargar las estadísticas. Inténtelo más tarde.";
        this.cargando = false;
      }
    });
  }

  renderChart(): void {
    let canvas = document.getElementById("chartEstadisticas") as HTMLCanvasElement;

    if (!canvas) {
      return;
    }

    let ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    // 🔥 Correr Chart.js fuera de la zona de Angular para evitar congelamiento
    this.ngZone.runOutsideAngular(() => {
      if (this.chartEstadisticas) {
        this.chartEstadisticas.destroy();
      }

      const values = [
        this.estadisticas?.totalTrabajadores || 0,
        this.estadisticas?.totalEquipos || 0,
        this.estadisticas?.totalPapeletas || 0
      ];

      const gradients = [
        this.createBarGradient(ctx!, "#38BDF8", "#0072BC"),
        this.createBarGradient(ctx!, "#0EA5E9", "#003E73"),
        this.createBarGradient(ctx!, "#7DD3FC", "#0284C7")
      ];

      this.chartEstadisticas = new Chart(ctx!, {
        type: "bar",
        data: {
          labels: ["Trabajadores", "Equipos", "Papeletas"],
          datasets: [{
            label: "Total",
            data: values,
            borderWidth: 0,
            backgroundColor: gradients,
            borderRadius: 14,
            borderSkipped: false,
            barThickness: 56,
            maxBarThickness: 64
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: {
              top: 26,
              right: 18,
              left: 4,
              bottom: 4
            }
          },
          scales: {
            x: {
              grid: {
                display: false
              },
              border: {
                display: false
              },
              ticks: {
                color: "#64748B",
                font: {
                  size: 12,
                  weight: 600
                }
              }
            },
            y: {
              beginAtZero: true,
              grace: "12%",
              border: {
                display: false
              },
              grid: {
                color: "rgba(148, 163, 184, 0.18)",
                drawTicks: false
              },
              ticks: {
                color: "#94A3B8",
                padding: 10,
                precision: 0,
                callback: function(value) {
                  return Number(value).toLocaleString();
                }
              }
            }
          },
          animation: {
            duration: 900,
            easing: "easeOutQuart"
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: "#0F172A",
              titleColor: "#F8FAFC",
              bodyColor: "#E2E8F0",
              padding: 12,
              cornerRadius: 10,
              displayColors: false,
              callbacks: {
                label: (context) => `Total: ${Number(context.parsed.y).toLocaleString()}`
              }
            },
            datalabels: {
              anchor: "end",
              align: "top",
              formatter: (value: number) => value.toLocaleString(),
              color: "#0F172A",
              font: {
                weight: "bold",
                size: 13
              }
            }
          }
        }
      });
    });
  }

  private createBarGradient(ctx: CanvasRenderingContext2D, from: string, to: string): CanvasGradient {
    const gradient = ctx.createLinearGradient(0, 40, 0, 280);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    return gradient;
  }
}
