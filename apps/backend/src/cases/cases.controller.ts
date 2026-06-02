import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CasesService } from './cases.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { multerOptions } from '../common/config/multer.config';

@Controller('cases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DOCTOR', 'PATIENT')
export class CasesController {
  constructor(
    private casesService: CasesService,
    private pdfService: PdfService,
  ) {}

  @Post('verify')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async verify(@UploadedFile() file: Express.Multer.File) {
    return this.casesService.verifyImage(file);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async create(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.casesService.create(user, file);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.casesService.findAll(user, { page, limit });
  }

  // NOTE: declared before @Get(':id') so ':id' does not capture "samples".
  @Get('samples')
  listSamples() {
    return this.casesService.listSamples();
  }

  @Post('from-sample')
  @HttpCode(201)
  createFromSample(@CurrentUser() user: any, @Body() body: { name: string }) {
    return this.casesService.createFromSample(user, body.name);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.casesService.findOne(user, id);
  }

  @Get(':id/attention')
  async getAttention(@CurrentUser() user: any, @Param('id') id: string) {
    return this.casesService.getAttention(user, id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const caseData = await this.casesService.findOne(user, id);
    const buf = await this.pdfService.generate(caseData);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="fedmri-case-${id.slice(0, 8)}.pdf"`,
      'Content-Length': buf.length,
    });
    res.end(buf);
  }

  @Post(':id/feedback')
  @HttpCode(201)
  async submitFeedback(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { type: 'VALIDATE' | 'DISPUTE'; correctSubtype?: string; justification?: string },
  ) {
    return this.casesService.submitFeedback(user, id, body);
  }
}
