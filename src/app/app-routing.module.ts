import { NgModule } from "@angular/core";
import { Routes, RouterModule } from "@angular/router";
import { ClaimPageComponent } from "./pages/claim-page/claim-page.component";
import { AuctionPageComponent } from "./pages/auction-page/auction-page.component";
import { StakingPageComponent } from "./pages/staking-page/staking-page.component";
import { MiningPageComponent } from "./pages/mining-page/mining-page.component";

const routes: Routes = [
  {
    path: "claim",
    component: ClaimPageComponent,
  },
  {
    path: "auction",
    component: AuctionPageComponent,
  },
  {
    path: "staking",
    component: StakingPageComponent,
  },
  {
    path: "mining",
    component: MiningPageComponent,
  },
  {
    path: "mining/:mine",
    component: MiningPageComponent,
  },
  {
    path: "**",
    redirectTo: "claim",
    pathMatch: "full",
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
