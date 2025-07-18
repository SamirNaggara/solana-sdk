import { PrismaClient } from "@prisma/client";
import { ValidationUtils } from './validation';

export class HistoryManager {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Record a change in product history
   * @param productId - The ID of the product
   * @param action - The action performed (CREATE, UPDATE, DELETE)
   * @param previousData - Previous product data (if applicable)
   * @param newData - New product data (if applicable)
   * @param changedBy - The user who made the change (will be normalized)
   * @param changeDescription - Optional description of the change
   */
  async recordProductHistory(
    productId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    previousData: any = null,
    newData: any = null,
    changedBy: string = 'system',
    changeDescription?: string
  ): Promise<void> {
    // Normalize the changedBy parameter
    const normalizedChangedBy = ValidationUtils.normalizeUserName(changedBy);

    await this.prisma.dppProductHistory.create({
      data: {
        productId,
        action,
        previousData: previousData ? JSON.parse(JSON.stringify(previousData)) : null,
        newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
        changedBy: normalizedChangedBy,
        changeDescription,
      },
    });
  }

  /**
   * Get the history of a specific product by its ID
   * @param productId - The ID of the product
   * @returns Array of history records for the product
   */
  async getProductHistory(productId: string): Promise<any[]> {
    const history = await this.prisma.dppProductHistory.findMany({
      where: { productId },
      orderBy: { changeTimestamp: 'desc' },
    });

    return history;
  }

  /**
    * Get all product history with pagination
    * @param page - Page number for pagination (default: 1)
    * @param limit - Number of records per page (default: 50)
    * @returns Object containing history records, total count, and total pages
   */
  async getAllProductHistory(
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count(),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history filtered by action (CREATE, UPDATE, DELETE)
   * @param action - The action to filter by
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   */
  async getProductHistoryByAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: { action },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({ where: { action } }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history by user who made the changes
   * @param changedBy - The user who made the changes
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   */
  async getProductHistoryByUser(
    changedBy: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: { changedBy },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({ where: { changedBy } }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history filtered by date range
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   */
  async getProductHistoryByDateRange(
    startDate: Date,
    endDate: Date,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: {
          changeTimestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({
        where: {
          changeTimestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get statistics about product history
   * @returns Object containing total changes, create count, update count,
   * delete count, unique products, and unique users
   */
  async getProductHistoryStats(): Promise<{
    totalChanges: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
    uniqueProducts: number;
    uniqueUsers: number;
  }> {
    const [
      totalChanges,
      createCount,
      updateCount,
      deleteCount,
      uniqueProductsResult,
      uniqueUsersResult,
    ] = await Promise.all([
      this.prisma.dppProductHistory.count(),
      this.prisma.dppProductHistory.count({ where: { action: 'CREATE' } }),
      this.prisma.dppProductHistory.count({ where: { action: 'UPDATE' } }),
      this.prisma.dppProductHistory.count({ where: { action: 'DELETE' } }),
      this.prisma.dppProductHistory.groupBy({
        by: ['productId'],
        _count: true,
      }),
      this.prisma.dppProductHistory.groupBy({
        by: ['changedBy'],
        _count: true,
      }),
    ]);

    return {
      totalChanges,
      createCount,
      updateCount,
      deleteCount,
      uniqueProducts: uniqueProductsResult.length,
      uniqueUsers: uniqueUsersResult.length,
    };
  }
}
