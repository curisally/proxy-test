import { useState } from 'react';
import './App.css';
import {
  Layout,
  Form,
  Input,
  Button,
  Table,
  Spin,
  Alert,
  Typography,
  Space,
  Card,
  Tag,
  Row,
  Col,
  Statistic,
  InputNumber,
  Tooltip,
  Modal,
  Descriptions
} from 'antd';
import type { TableProps } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined, FieldTimeOutlined, DownloadOutlined } from '@ant-design/icons';

const { Header, Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

interface ProxyTestResult {
  key: string;
  proxy: string;
  status: 'success' | 'error';
  ip?: string;
  response_time_ms?: number;
  error?: string;
  // location?: string; // REMOVED: No longer using IP2Location
  geo_location?: { // Data from ip-api.com
    status: string;
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    zip: string;
    lat: number;
    lon: number;
    timezone: string;
    isp: string;
    org: string;
    as: string;
    query: string;
  };
  city?: string; // Extracted from geo_location.city for direct display
  country?: string; // Extracted from geo_location.country for direct display
  geo_location_error?: string;
}

const BACKEND_URL = import.meta.env.DEV ? 'http://localhost:5001/test_proxies' : '/test_proxies';

function App() {
  const [form] = Form.useForm();
  const [results, setResults] = useState<ProxyTestResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const [isDetailModalVisible, setIsDetailModalVisible] = useState<boolean>(false);
  const [selectedProxyDetail, setSelectedProxyDetail] = useState<ProxyTestResult | null>(null);

  const handleTestProxies = async (values: { proxiesInput: string; maxThreads: number }) => {
    const { proxiesInput, maxThreads } = values;
    if (!proxiesInput || !proxiesInput.trim()) {
      setErrorMessage('请输入代理列表。');
      setResults([]);
      setSuccessCount(0);
      setErrorCount(0);
      return;
    }
    setIsLoading(true);
    setResults([]);
    setErrorMessage('');
    setSuccessCount(0);
    setErrorCount(0);

    try {
      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proxies: proxiesInput,
          max_threads: maxThreads > 0 ? maxThreads : 10,
          get_geo_location: true, 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP 错误: ${response.status}` }));
        throw new Error(errorData.error || `HTTP 错误: ${response.status}`);
      }

      const data: Omit<ProxyTestResult, 'key'>[] = await response.json();
      const processedResults = data.map((item, index) => ({
        ...item,
        key: `${item.proxy}-${index}`,
        // Backend now directly provides city and country if geo_location is successful
        // city: item.geo_location?.city, 
        // country: item.geo_location?.country,
      }));
      setResults(processedResults);
      setSuccessCount(processedResults.filter(r => r.status === 'success').length);
      setErrorCount(processedResults.filter(r => r.status === 'error').length);

    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(`测试代理时出错: ${error.message}`);
      } else {
        setErrorMessage('测试代理时发生未知错误。');
      }
      console.error("Error testing proxies:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const showProxyDetailModal = (record: ProxyTestResult) => {
    setSelectedProxyDetail(record);
    setIsDetailModalVisible(true);
  };

  const handleDetailModalClose = () => {
    setIsDetailModalVisible(false);
    setSelectedProxyDetail(null);
  };

  const handleDownloadCsv = () => {
    const successfulProxies = results.filter(r => r.status === 'success');
    if (successfulProxies.length === 0) {
      Modal.info({
        title: '无成功代理',
        content: '当前没有通过测试的代理可供下载。',
      });
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const timestamp = `${year}${month}${day}${hours}${minutes}${seconds}`;
    const fileName = `successful_proxies_${timestamp}.csv`;

    const csvHeader = "原始代理,IP地址,国家\n";
    const csvRows = successfulProxies.map(item => {
      const country = item.country || item.geo_location?.country || 'N/A';
      const ip = item.ip || 'N/A';
      const proxy = item.proxy;
      return `${proxy},${ip},${country}`;
    }).join('\n');

    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) { // feature detection
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      Modal.error({
        title: '下载失败',
        content: '您的浏览器不支持自动下载功能。',
      });
    }
  };

  const columns: TableProps<ProxyTestResult>['columns'] = [
    {
      title: '原始代理',
      dataIndex: 'proxy',
      key: 'proxy',
      width: 220,
      ellipsis: true,
      render: (text: string) => <Tooltip title={text} placement="topLeft">{text}</Tooltip>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      fixed: 'left',
      render: (status: ProxyTestResult['status']) =>
        status === 'success' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
        ),
    },
    {
      title: '检测IP',
      dataIndex: 'ip',
      key: 'ip',
      width: 140,
      render: (ip?: string) => ip || '-',
    },
    // { // REMOVED: No longer using IP2Location column
    //   title: '位置 (IP2Loc)',
    //   dataIndex: 'location',
    //   key: 'location',
    //   width: 150,
    //   render: (location?: string) => location || 'N/A',
    // },
    {
      title: '国家 (ip-api)',
      dataIndex: 'country', // This field is now directly in ProxyTestResult from backend
      key: 'country',
      width: 120,
      render: (country?: string, record?: ProxyTestResult) => {
        if (record?.status !== 'success') return '-';
        if (record?.geo_location_error) return <Tooltip title={record.geo_location_error}><Tag color="warning">错误</Tag></Tooltip>;
        // Use 'country' field directly if available, fallback to geo_location object
        return country || record?.geo_location?.country || 'N/A';
      },
    },
    {
      title: '城市 (ip-api)',
      dataIndex: 'city', // This field is now directly in ProxyTestResult from backend
      key: 'city',
      width: 120,
      render: (city?: string, record?: ProxyTestResult) => {
        if (record?.status !== 'success') return '-';
        if (record?.geo_location_error) return <Tooltip title={record.geo_location_error}><Tag color="warning">错误</Tag></Tooltip>;
        // Use 'city' field directly if available, fallback to geo_location object
        return city || record?.geo_location?.city || 'N/A';
      },
    },
    {
      title: '响应 (ms)',
      dataIndex: 'response_time_ms',
      key: 'response_time_ms',
      width: 110,
      render: (time?: number) => (time !== undefined ? time.toFixed(2) : '-'),
    },
    {
      title: '错误信息',
      dataIndex: 'error',
      key: 'error',
      render: (error?: string) => error || '-',
      ellipsis: true,
    },
    {
      title: '详情 (ip-api)',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_: any, record: ProxyTestResult) => {
        // Show button if geo_location data exists and was successful
        if (record.status === 'success' && record.geo_location && record.geo_location.status === 'success') {
          return (
            <Button type="link" size="small" onClick={() => showProxyDetailModal(record)}>
              查看详情
            </Button>
          );
        }
        // Optionally, show something if there was a geo_location_error but proxy was success
        // else if (record.status === 'success' && record.geo_location_error) {
        //   return <Tooltip title={record.geo_location_error}><Tag color="orange">位置错误</Tag></Tooltip>
        // }
        return null;
      },
    },
  ];

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <Title level={3} className="app-header-title">
          <GlobalOutlined style={{ marginRight: 8 }} />
          代理批量有效性测试工具
        </Title>
      </Header>
      <Content className="app-content" style={{ padding: '24px', minHeight: 'calc(100vh - 134px)' }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={8} xl={7}>
            <Space direction="vertical" size="large" style={{ display: 'flex' }}>
              <Card
                id="proxyInputCard"
                title={<Title level={4} className="card-title-custom">输入配置</Title>}
                className="app-card"
                bordered={false}
                style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)' }}
              >
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleTestProxies}
                  initialValues={{ maxThreads: 10, proxiesInput: '' }}
                >
                  <Form.Item
                    name="proxiesInput"
                    label="代理列表 (一行一个)"
                    rules={[{ required: true, message: '请输入代理列表!' }]}
                  >
                    <TextArea
                      rows={10}
                      placeholder={"例如:\nhttp://127.0.0.1:8080\nsocks5://user:pass@example.com:1080\n192.168.1.1:8888 (默认为 http)"}
                    />
                  </Form.Item>
                  <Form.Item
                    name="maxThreads"
                    label="最大并发线程数"
                    rules={[{ type: 'number', min: 1, message: '线程数至少为1' }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={isLoading} block icon={<FieldTimeOutlined />}>
                      {isLoading ? '测试中...' : '开始测试'}
                    </Button>
                  </Form.Item>
                </Form>
              </Card>

              {errorMessage && (
                <Alert message="错误" description={errorMessage} type="error" showIcon />
              )}

              {(results.length > 0 || isLoading) && (
                <Card
                  title={<Title level={4} className="card-title-custom">测试统计</Title>}
                  className="app-card"
                  bordered={false}
                  style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)' }}
                >
                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Statistic title="总数" value={results.length > 0 ? results.length : (isLoading ? '-' : 0)} />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic title="成功" value={successCount} className="statistic-success" />
                    </Col>
                    <Col xs={24} sm={8}>
                      <Statistic title="失败" value={errorCount} className="statistic-error" />
                    </Col>
                  </Row>
                </Card>
              )}
            </Space>
          </Col>

          <Col xs={24} lg={16} xl={17}>
            <Card
              title={<Title level={4} className="card-title-custom">测试结果</Title>}
              extra={
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownloadCsv}
                  disabled={successCount === 0}
                >
                  下载成功代理 (CSV)
                </Button>
              }
              className="app-card"
              bordered={false}
              style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)' }}
            >
              <Spin spinning={isLoading} tip="正在努力测试代理中..." size="large">
                <Table
                  columns={columns}
                  dataSource={results}
                  pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], position: ['bottomRight'] }}
                  scroll={{ x: 1100 }} // Adjusted scroll width after removing a column
                  rowClassName={(record) => record.status === 'success' ? 'table-row-success' : 'table-row-error'}
                  size="small"
                />
              </Spin>
            </Card>
          </Col>
        </Row>
        {selectedProxyDetail && selectedProxyDetail.geo_location && (
          <Modal
            title={<Text strong>代理地理位置详情: <Tag>{selectedProxyDetail.proxy}</Tag></Text>}
            visible={isDetailModalVisible}
            onCancel={handleDetailModalClose}
            footer={[
              <Button key="back" onClick={handleDetailModalClose}>
                关闭
              </Button>,
            ]}
            width={700}
          >
            <Descriptions bordered column={{ xxl: 2, xl: 2, lg: 2, md: 1, sm: 1, xs: 1 }} size="small" layout="vertical">
              <Descriptions.Item label="查询IP (Query IP)">{selectedProxyDetail.geo_location.query}</Descriptions.Item>
              <Descriptions.Item label="状态 (Status)">{selectedProxyDetail.geo_location.status === 'success' ? <Tag color="success">成功</Tag> : <Tag color="error">{selectedProxyDetail.geo_location.status}</Tag>}</Descriptions.Item>
              <Descriptions.Item label="国家 (Country)">{selectedProxyDetail.geo_location.country} ({selectedProxyDetail.geo_location.countryCode})</Descriptions.Item>
              <Descriptions.Item label="区域 (Region)">{selectedProxyDetail.geo_location.regionName} ({selectedProxyDetail.geo_location.region})</Descriptions.Item>
              <Descriptions.Item label="城市 (City)">{selectedProxyDetail.geo_location.city}</Descriptions.Item>
              <Descriptions.Item label="邮编 (ZIP Code)">{selectedProxyDetail.geo_location.zip}</Descriptions.Item>
              <Descriptions.Item label="经度 (Longitude)">{selectedProxyDetail.geo_location.lon}</Descriptions.Item>
              <Descriptions.Item label="纬度 (Latitude)">{selectedProxyDetail.geo_location.lat}</Descriptions.Item>
              <Descriptions.Item label="时区 (Timezone)">{selectedProxyDetail.geo_location.timezone}</Descriptions.Item>
              <Descriptions.Item label="ISP">{selectedProxyDetail.geo_location.isp}</Descriptions.Item>
              <Descriptions.Item label="组织 (Organization)">{selectedProxyDetail.geo_location.org || '-'}</Descriptions.Item>
              <Descriptions.Item label="AS号码 (AS Number)">{selectedProxyDetail.geo_location.as}</Descriptions.Item>
            </Descriptions>
          </Modal>
        )}
      </Content>
    </Layout>
  );
}

export default App;
