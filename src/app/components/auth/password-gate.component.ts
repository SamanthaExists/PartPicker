import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';

const CORRECT_PASSWORD = '1977';

@Component({
  selector: 'app-password-gate',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <ng-container *ngIf="settingsService.isAuthenticated(); else passwordModal">
      <ng-content></ng-content>
    </ng-container>

    <ng-template #passwordModal>
      <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
        <div class="modal-dialog modal-dialog-centered" style="max-width: 400px;">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title d-flex align-items-center gap-2">
                <i class="bi bi-lock-fill"></i>
                Password Required
              </h5>
            </div>
            <form (ngSubmit)="handleSubmit()">
              <div class="modal-body">
                <p class="text-muted mb-3">
                  Please enter the password to access the Tool Pick List application.
                </p>
                <div class="mb-3">
                  <label for="password" class="form-label">Password</label>
                  <input
                    id="password"
                    type="password"
                    class="form-control"
                    placeholder="Enter password"
                    [(ngModel)]="password"
                    name="password"
                    autofocus
                    (input)="error = false"
                  >
                </div>
                <div *ngIf="error" class="d-flex align-items-center gap-2 text-danger small">
                  <i class="bi bi-exclamation-circle"></i>
                  Incorrect password
                </div>
              </div>
              <div class="modal-footer">
                <button type="submit" class="btn btn-primary" [disabled]="!password">
                  Enter
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class PasswordGateComponent {
  password = '';
  error = false;

  constructor(public settingsService: SettingsService) {}

  handleSubmit(): void {
    if (this.password === CORRECT_PASSWORD) {
      this.settingsService.authenticate();
      this.error = false;
    } else {
      this.error = true;
      this.password = '';
    }
  }
}
