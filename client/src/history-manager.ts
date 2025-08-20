import { Pool } from "pg";
import { ValidationUtils } from './validation';

export class HistoryManager {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
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

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO dpp_product_history 
         (product_id, action, previous_data, new_data, changed_by, change_description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          productId,
          action,
          previousData ? JSON.stringify(previousData) : null,
          newData ? JSON.stringify(newData) : null,
          normalizedChangedBy,
          changeDescription
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get the history of a specific product by its ID
   * @param productId - The ID of the product
   * @returns Array of history records for the product
   */
  async getProductHistory(productId: string): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM dpp_product_history 
         WHERE product_id = $1 
         ORDER BY change_timestamp DESC`,
        [productId]
      );
      return result.rows;
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const [historyResult, totalResult] = await Promise.all([
        client.query(
          `SELECT * FROM dpp_product_history 
           ORDER BY change_timestamp DESC 
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        ),
        client.query('SELECT COUNT(*) FROM dpp_product_history')
      ]);

      const total = parseInt(totalResult.rows[0].count);

      return {
        history: historyResult.rows,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const [historyResult, totalResult] = await Promise.all([
        client.query(
          `SELECT * FROM dpp_product_history 
           WHERE action = $1
           ORDER BY change_timestamp DESC 
           LIMIT $2 OFFSET $3`,
          [action, limit, offset]
        ),
        client.query('SELECT COUNT(*) FROM dpp_product_history WHERE action = $1', [action])
      ]);

      const total = parseInt(totalResult.rows[0].count);

      return {
        history: historyResult.rows,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const [historyResult, totalResult] = await Promise.all([
        client.query(
          `SELECT * FROM dpp_product_history 
           WHERE changed_by = $1
           ORDER BY change_timestamp DESC 
           LIMIT $2 OFFSET $3`,
          [changedBy, limit, offset]
        ),
        client.query('SELECT COUNT(*) FROM dpp_product_history WHERE changed_by = $1', [changedBy])
      ]);

      const total = parseInt(totalResult.rows[0].count);

      return {
        history: historyResult.rows,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const [historyResult, totalResult] = await Promise.all([
        client.query(
          `SELECT * FROM dpp_product_history 
           WHERE change_timestamp >= $1 AND change_timestamp <= $2
           ORDER BY change_timestamp DESC 
           LIMIT $3 OFFSET $4`,
          [startDate, endDate, limit, offset]
        ),
        client.query(
          'SELECT COUNT(*) FROM dpp_product_history WHERE change_timestamp >= $1 AND change_timestamp <= $2',
          [startDate, endDate]
        )
      ]);

      const total = parseInt(totalResult.rows[0].count);

      return {
        history: historyResult.rows,
        total,
        totalPages: Math.ceil(total / limit),
      };
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const [
        totalResult,
        createResult,
        updateResult,
        deleteResult,
        uniqueProductsResult,
        uniqueUsersResult,
      ] = await Promise.all([
        client.query('SELECT COUNT(*) FROM dpp_product_history'),
        client.query('SELECT COUNT(*) FROM dpp_product_history WHERE action = $1', ['CREATE']),
        client.query('SELECT COUNT(*) FROM dpp_product_history WHERE action = $1', ['UPDATE']),
        client.query('SELECT COUNT(*) FROM dpp_product_history WHERE action = $1', ['DELETE']),
        client.query('SELECT COUNT(DISTINCT product_id) FROM dpp_product_history'),
        client.query('SELECT COUNT(DISTINCT changed_by) FROM dpp_product_history'),
      ]);

      return {
        totalChanges: parseInt(totalResult.rows[0].count),
        createCount: parseInt(createResult.rows[0].count),
        updateCount: parseInt(updateResult.rows[0].count),
        deleteCount: parseInt(deleteResult.rows[0].count),
        uniqueProducts: parseInt(uniqueProductsResult.rows[0].count),
        uniqueUsers: parseInt(uniqueUsersResult.rows[0].count),
      };
    } finally {
      client.release();
    }
  }
}
