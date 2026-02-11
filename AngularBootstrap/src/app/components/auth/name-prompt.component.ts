import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-name-prompt',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="showPrompt" class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5);">
      <div class="modal-dialog modal-dialog-centered" style="max-width: 400px;">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title d-flex align-items-center gap-2">
              <i class="bi bi-person-fill"></i>
              Welcome! What's your name?
            </h5>
          </div>
          <form (ngSubmit)="handleSubmit()">
            <div class="modal-body">
              <p class="text-muted mb-3">
                Your name will be recorded with any picks or changes you make,
                so the team can see who did what.
              </p>
              <div class="mb-3">
                <label for="userName" class="form-label">Your Name</label>
                <input
                  id="userName"
                  type="text"
                  class="form-control"
                  placeholder="Enter your name"
                  [(ngModel)]="name"
                  name="userName"
                  autofocus
                  autocomplete="name"
                >
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary" [disabled]="!name.trim()">
                Continue
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `
})
export class NamePromptComponent implements OnInit {
  showPrompt = false;
  name = '';

  constructor(private settingsService: SettingsService) {}

  ngOnInit(): void {
    if (!this.settingsService.getUserName()) {
      this.showPrompt = true;
    }
  }

  handleSubmit(): void {
    if (this.name.trim()) {
      this.settingsService.setUserName(this.name.trim());
      this.showPrompt = false;
    }
  }
}
