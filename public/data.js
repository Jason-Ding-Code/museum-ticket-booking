// 数据文件路径
const MUSEUM_DATA_FILE = 'museum_tickets.json';
const BOOKING_RECORDS_FILE = 'booking_records.json';

// 类型定义
/**
 * @typedef {Object} Museum
 * @property {string} name
 * @property {number} capacity
 * @property {string[]} openDays
 */

/**
 * @typedef {Object} BookingRecord
 * @property {string} name
 * @property {string} museum
 * @property {string} date
 * @property {string} timestamp
 */

// 缓存数据
let museumData = null;
let bookingRecords = [];

// 数据服务模块
const DataService = {
    /**
     * 加载博物馆数据
     * @returns {Promise<Museum[]>}
     */
    async loadMuseumData() {
        try {
            if (museumData) return museumData;
            
            const response = await fetch(MUSEUM_DATA_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            museumData = await response.json();
            return museumData;
        } catch (error) {
            console.error('加载博物馆数据失败:', error);
            throw new Error('无法加载博物馆数据');
        }
    },

    /**
     * 获取所有博物馆名称
     * @returns {Promise<string[]>}
     */
    async getMuseumNames() {
        try {
            const data = await this.loadMuseumData();
            return data.map(museum => museum.name).filter(Boolean);
        } catch (error) {
            console.error('获取博物馆名称失败:', error);
            return [];
        }
    },

    /**
     * 检查门票是否可用
     * @param {string} museumName
     * @param {string} date
     * @returns {Promise<boolean>}
     */
    async isTicketAvailable(museumName, date) {
        try {
            const data = await this.loadMuseumData();
            const museum = data.find(m => m.name === museumName);
            
            if (!museum) {
                throw new Error(`未找到博物馆: ${museumName}`);
            }

            const bookings = await this.getBookingRecords();
            const bookedCount = bookings.filter(b => 
                b.museum === museumName && b.date === date
            ).length;

            return bookedCount < museum.capacity / 2;
        } catch (error) {
            console.error('检查门票可用性失败:', error);
            return false;
        }
    },

    /**
     * 加载预订记录
     * @returns {Promise<void>}
     */
    async loadBookingRecords() {
        try {
            const response = await fetch(BOOKING_RECORDS_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            bookingRecords = await response.json();
        } catch (error) {
            console.error('加载预订记录失败:', error);
            bookingRecords = [];
        }
    },

    /**
     * 获取所有预订记录
     * @returns {BookingRecord[]}
     */
    getBookingRecords() {
        return bookingRecords;
    },

    /**
     * 添加预订记录
     * @param {string} name
     * @param {string} museum
     * @param {string} date
     * @returns {Promise<boolean>}
     */
    async addBookingRecord(name, museum, date) {
        try {
            // 输入验证
            if (!name || !museum || !date) {
                throw new Error('缺少必要参数');
            }

            const record = {
                name,
                museum,
                date,
                timestamp: new Date().toISOString()
            };

            bookingRecords.push(record);
            return await this.saveBookingRecords();
        } catch (error) {
            console.error('添加预订记录失败:', error);
            return false;
        }
    },

    /**
     * 保存预订记录
     * @returns {Promise<boolean>}
     */
    async saveBookingRecords() {
        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(bookingRecords)
            });

            if (!response.ok) {
                throw new Error(`保存失败: ${response.statusText}`);
            }

            return true;
        } catch (error) {
            console.error('保存预订记录失败:', error);
            return false;
        }
    }
};

// 初始化时加载数据
(async function init() {
    await DataService.loadMuseumData();
    await DataService.loadBookingRecords();
})();

export default DataService;
