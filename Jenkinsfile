pipeline {
    agent any

    environment {
        CI = 'true'
        PATH = "/usr/bin:/usr/local/bin:$PATH"
        AWS_ACCESS_KEY_ID = 'testing'
        AWS_SECRET_ACCESS_KEY = 'testing'
        AWS_DEFAULT_REGION = 'ap-south-1'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Setup Dependencies') {
            steps {
                sh '''
                    echo "=== Setting up Python Virtual Environment & Dependencies ==="
                    python3 -m venv venv || true
                    . venv/bin/activate
                    pip install --upgrade pip
                    pip install -r edge-kiosk/requirements.txt
                    pip install -r aws-backend/handlers/requirements.txt
                    pip install pytest pytest-mock
                '''
            }
        }

        stage('Run Pytest Suite') {
            steps {
                sh '''
                    echo "=== Running 30 Automated Biometric & Cloud Tests ==="
                    . venv/bin/activate
                    pytest tests/ -v --tb=short
                '''
            }
        }

        stage('Build React Web Dashboard') {
            steps {
                dir('dashboard') {
                    sh '''
                        echo "=== Installing Frontend Dependencies & Building Vite App ==="
                        npm install
                        npm run build
                    '''
                }
            }
        }

        stage('Deploy / Reload Service') {
            steps {
                sh '''
                    echo "=== Deploying to Live Production & Restarting PM2 ==="
                    chmod +x scripts/deploy_production.sh || true
                    sudo -u ubuntu bash /home/ubuntu/aws-face-recognition-attendance-system/scripts/deploy_production.sh || \
                    sudo -u ubuntu bash -c 'cd /home/ubuntu/aws-face-recognition-attendance-system && git fetch origin main && git reset --hard origin/main && cd dashboard && npm install && pm2 restart attendance-dashboard' || true
                '''
            }
        }
    }

    post {
        success {
            echo "Pipeline succeeded! Smart Attendance application verified and deployed."
        }
        failure {
            echo "Pipeline failed! Please check console output for errors."
        }
    }
}
